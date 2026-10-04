package repo

import (
	"context"
	"strings"
	"sync"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/attachment"
	"github.com/sysadminsmedia/homebox/backend/internal/data/types"
	"gocloud.dev/blob"
)

func TestDisposalEvidenceRetentionAndIsolation(t *testing.T) {
	ctx := context.Background()
	asset := useEntities(t, 1)[0]
	cert, err := tRepos.Attachments.Create(ctx, asset.ID, ItemCreateAttachment{Title: "certificate.pdf", Content: strings.NewReader("%PDF-1.7\nretained destruction evidence")}, attachment.TypeAttachment, false)
	require.NoError(t, err)
	unrelated, err := tRepos.Attachments.Create(ctx, asset.ID, ItemCreateAttachment{Title: "notes", Content: strings.NewReader("unrelated attachment")}, attachment.TypeAttachment, false)
	require.NoError(t, err)
	input := EntityOffboarding{Route: "destruction", Destruction: &DestructionInput{Declared: true, Date: types.DateFromString("2026-10-01"), Method: "Shredded", Evidence: []types.DestructionEvidence{{AttachmentID: cert.ID, Kind: "certificate"}}}}
	record, err := tRepos.Entities.OffboardByGroup(ctx, tGroup.ID, asset.ID, tUser.ID, input)
	require.NoError(t, err)
	retained, err := tRepos.Entities.GetOneByGroup(ctx, tGroup.ID, asset.ID)
	require.NoError(t, err)
	require.Len(t, retained.Attachments, 2, "offboarding must not remove any attachment")
	foreign := uuid.New()
	_, err = tRepos.Entities.OffboardByGroup(ctx, foreign, asset.ID, tUser.ID, input)
	require.True(t, ent.IsNotFound(err))
	_, err = tRepos.Entities.GetOneByGroup(ctx, foreign, asset.ID)
	require.True(t, ent.IsNotFound(err))
	_, err = tRepos.Attachments.Get(ctx, foreign, cert.ID)
	require.True(t, ent.IsNotFound(err))
	require.True(t, ent.IsNotFound(tRepos.Attachments.Delete(ctx, foreign, cert.ID)))
	_, err = tRepos.Attachments.Update(ctx, foreign, cert.ID, &ItemAttachmentUpdate{Type: "manual"})
	require.True(t, ent.IsNotFound(err))
	require.True(t, ent.IsNotFound(tRepos.Entities.DeleteByGroup(ctx, foreign, asset.ID)))

	require.ErrorIs(t, tRepos.Attachments.Delete(ctx, tGroup.ID, cert.ID), ErrRetainedDisposal)
	_, err = tRepos.Attachments.Update(ctx, tGroup.ID, cert.ID, &ItemAttachmentUpdate{Type: "manual"})
	require.ErrorIs(t, err, ErrRetainedDisposal)
	for _, remove := range []func() error{
		func() error { return tRepos.Entities.Delete(ctx, asset.ID) },
		func() error { return tRepos.Entities.DeleteByGroup(ctx, tGroup.ID, asset.ID) },
		func() error { return tRepos.Entities.DeleteContainerByGroup(ctx, tGroup.ID, asset.ID) },
	} {
		require.ErrorIs(t, remove(), ErrRetainedDisposal)
	}
	_, err = tRepos.Entities.WipeInventory(ctx, tGroup.ID, true, true, true)
	require.ErrorIs(t, err, ErrRetainedDisposal)
	// Ordinary changes remain available, but cannot change disposal JSON or
	// reclassify evidence. Unreferenced attachments are not broadly locked.
	_, err = tRepos.Attachments.Rename(ctx, tGroup.ID, cert.ID, "renamed certificate")
	require.NoError(t, err)
	_, err = tRepos.Attachments.Update(ctx, tGroup.ID, cert.ID, &ItemAttachmentUpdate{Type: "attachment"})
	require.NoError(t, err)
	require.NoError(t, tRepos.Attachments.Delete(ctx, tGroup.ID, unrelated.ID))
	_, err = tRepos.Entities.UpdateByGroup(ctx, tGroup.ID, EntityUpdate{ID: asset.ID, Name: "renamed asset", Quantity: 1, Archived: true})
	require.NoError(t, err)
	retained, err = tRepos.Entities.GetOneByGroup(ctx, tGroup.ID, asset.ID)
	require.NoError(t, err)
	require.True(t, retained.Disposed)
	require.Equal(t, []types.Disposal{record}, retained.DisposalHistory)
	require.Len(t, retained.Attachments, 1)
	result, err := tRepos.Entities.QueryByGroup(ctx, tGroup.ID, EntityQuery{OnlyOffboarded: true, Search: "renamed asset", Page: -1, PageSize: -1})
	require.NoError(t, err)
	require.Equal(t, asset.ID, result.Items[0].ID)
	bucket, err := blob.OpenBucket(ctx, tRepos.Attachments.GetConnString())
	require.NoError(t, err)
	defer func() { _ = bucket.Close() }()
	contents, err := bucket.ReadAll(ctx, tRepos.Attachments.GetFullPath(cert.Path))
	require.NoError(t, err)
	require.Equal(t, "%PDF-1.7\nretained destruction evidence", string(contents))
}

func TestDisposalRacingEvidenceRemoval(t *testing.T) {
	ctx := context.Background()
	for i := 0; i < 10; i++ {
		asset := useEntities(t, 1)[0]
		cert, err := tRepos.Attachments.Create(ctx, asset.ID, ItemCreateAttachment{Title: "race.pdf", Content: strings.NewReader("%PDF-1.7\nrace evidence")}, attachment.TypeAttachment, false)
		require.NoError(t, err)
		input := EntityOffboarding{Route: "destruction", Destruction: &DestructionInput{Declared: true, Date: types.DateFromString("2026-10-01"), Method: "Shredded", Evidence: []types.DestructionEvidence{{AttachmentID: cert.ID, Kind: "certificate"}}}}
		var wg sync.WaitGroup
		start := make(chan struct{})
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			_, _ = tRepos.Entities.OffboardByGroup(ctx, tGroup.ID, asset.ID, tUser.ID, input)
		}()
		go func() {
			defer wg.Done()
			<-start
			if i%2 == 0 {
				_ = tRepos.Attachments.Delete(ctx, tGroup.ID, cert.ID)
			} else {
				_, _ = tRepos.Attachments.Update(ctx, tGroup.ID, cert.ID, &ItemAttachmentUpdate{Type: "manual"})
			}
		}()
		close(start)
		wg.Wait()
		retained, err := tRepos.Entities.GetOneByGroup(ctx, tGroup.ID, asset.ID)
		require.NoError(t, err)
		if retained.Disposed {
			evidence, err := tRepos.Attachments.Get(ctx, tGroup.ID, cert.ID)
			require.NoError(t, err, "a completed destruction must retain its evidence")
			require.Equal(t, attachment.TypeAttachment, evidence.Type)
			bucket, err := blob.OpenBucket(ctx, tRepos.Attachments.GetConnString())
			require.NoError(t, err)
			_, err = bucket.ReadAll(ctx, tRepos.Attachments.GetFullPath(evidence.Path))
			require.NoError(t, err)
			require.NoError(t, bucket.Close())
		}
	}
}
