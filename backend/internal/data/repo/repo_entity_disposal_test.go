package repo

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent"
	"github.com/sysadminsmedia/homebox/backend/internal/data/types"
)

func TestEntityOffboardingRoutesAndRetention(t *testing.T) {
	ctx := context.Background()
	for _, route := range []string{"sale", "donation", "recycling"} {
		t.Run(route, func(t *testing.T) {
			asset := useEntities(t, 1)[0]
			// Archive and old sold metadata are orthogonal to disposal.
			_, err := tClient.Entity.UpdateOneID(asset.ID).SetArchived(true).SetSoldTo("old buyer").Save(ctx)
			require.NoError(t, err)
			before, err := tRepos.Entities.GetOneByGroup(ctx, tGroup.ID, asset.ID)
			require.NoError(t, err)
			require.False(t, before.Disposed)
			require.Empty(t, before.DisposalHistory)
			start := time.Now().UTC()
			record, err := tRepos.Entities.OffboardByGroup(ctx, tGroup.ID, asset.ID, tUser.ID, EntityOffboarding{Route: route})
			require.NoError(t, err)
			require.Equal(t, route, record.Route)
			require.Equal(t, tUser.ID, record.SubmittedBy)
			require.False(t, record.SubmittedAt.Before(start))
			after, err := tRepos.Entities.GetOneByGroup(ctx, tGroup.ID, asset.ID)
			require.NoError(t, err)
			require.True(t, after.Disposed)
			require.True(t, after.Archived)
			require.Equal(t, "old buyer", after.SoldTo)
			require.Equal(t, asset.Name, after.Name)
			require.Equal(t, []types.Disposal{record}, after.DisposalHistory)
			_, err = tRepos.Entities.OffboardByGroup(ctx, tGroup.ID, asset.ID, tUser.ID, EntityOffboarding{Route: "recycling"})
			require.ErrorIs(t, err, ErrAlreadyDisposed)
			retained, err := tRepos.Entities.GetOneByGroup(ctx, tGroup.ID, asset.ID)
			require.NoError(t, err)
			require.Equal(t, after.DisposalHistory, retained.DisposalHistory)
		})
	}
}

func TestEntityOffboardingRejectedRequestsStayActive(t *testing.T) {
	ctx := context.Background()
	asset := useEntities(t, 1)[0]
	for _, route := range []string{"", "invalid", "destruction"} {
		_, err := tRepos.Entities.OffboardByGroup(ctx, tGroup.ID, asset.ID, tUser.ID, EntityOffboarding{Route: route})
		require.Error(t, err)
	}
	_, err := tRepos.Entities.OffboardByGroup(ctx, uuid.New(), asset.ID, tUser.ID, EntityOffboarding{Route: "sale"})
	require.True(t, ent.IsNotFound(err))
	_, err = tRepos.Entities.OffboardByGroup(ctx, tGroup.ID, asset.ID, uuid.Nil, EntityOffboarding{Route: "sale"})
	require.ErrorIs(t, err, ErrInvalidDisposal)
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	_, err = tRepos.Entities.OffboardByGroup(cancelled, tGroup.ID, asset.ID, tUser.ID, EntityOffboarding{Route: "sale"})
	require.Error(t, err)
	after, err := tRepos.Entities.GetOneByGroup(ctx, tGroup.ID, asset.ID)
	require.NoError(t, err)
	require.False(t, after.Disposed)
	require.Empty(t, after.DisposalHistory)
}

func TestEntityOffboardingWriteFailureIsAtomic(t *testing.T) {
	ctx := context.Background()
	asset := useEntities(t, 1)[0]
	failure := errors.New("injected write failure")
	// A per-client hook avoids altering the shared fixture's other writes.
	client, err := ent.Open("sqlite3", "file:ent?mode=memory&cache=shared&_fk=1&_time_format=sqlite")
	require.NoError(t, err)
	defer func() { _ = client.Close() }()
	client.Entity.Use(func(next ent.Mutator) ent.Mutator {
		return ent.MutateFunc(func(ctx context.Context, m ent.Mutation) (ent.Value, error) {
			if em, ok := m.(*ent.EntityMutation); ok {
				if disposed, set := em.Disposed(); set && disposed {
					return nil, failure
				}
			}
			return next.Mutate(ctx, m)
		})
	})
	r := &EntityRepository{db: client}
	certificate, err := tClient.Attachment.Create().SetEntityID(asset.ID).SetType("attachment").SetMimeType("application/pdf").SetPath("uploaded/certificate").Save(ctx)
	require.NoError(t, err)
	defer func() { _ = tClient.Attachment.DeleteOneID(certificate.ID).Exec(ctx) }()
	for _, input := range []EntityOffboarding{
		{Route: "sale"},
		{Route: "destruction", Destruction: &DestructionInput{Declared: true, Date: types.DateFromString("2026-10-01"), Method: "Shredded", Evidence: []types.DestructionEvidence{{AttachmentID: certificate.ID, Kind: "certificate"}}}},
	} {
		_, err = r.OffboardByGroup(ctx, tGroup.ID, asset.ID, tUser.ID, input)
		require.ErrorIs(t, err, failure)
	}
	after, err := tRepos.Entities.GetOneByGroup(ctx, tGroup.ID, asset.ID)
	require.NoError(t, err)
	require.False(t, after.Disposed)
	require.Empty(t, after.DisposalHistory)
}

func TestEntityOffboardingConcurrentSubmissions(t *testing.T) {
	ctx := context.Background()
	asset := useEntities(t, 1)[0]
	certificate, err := tClient.Attachment.Create().SetEntityID(asset.ID).SetType("attachment").SetMimeType("application/pdf").SetPath("uploaded/certificate").Save(ctx)
	require.NoError(t, err)
	defer func() { _ = tClient.Attachment.DeleteOneID(certificate.ID).Exec(ctx) }()
	start := make(chan struct{})
	results := make(chan error, 12)
	var wg sync.WaitGroup
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			<-start
			input := EntityOffboarding{Route: []string{"sale", "donation", "recycling", "destruction"}[i%4]}
			if input.Route == "destruction" {
				input.Destruction = &DestructionInput{Declared: true, Date: types.DateFromString("2026-10-01"), Method: "Shredded", Evidence: []types.DestructionEvidence{{AttachmentID: certificate.ID, Kind: "certificate"}}}
			}
			_, err := tRepos.Entities.OffboardByGroup(ctx, tGroup.ID, asset.ID, tUser.ID, input)
			results <- err
		}(i)
	}
	close(start)
	wg.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		}
	}
	require.Equal(t, 1, successes)
	after, err := tRepos.Entities.GetOneByGroup(ctx, tGroup.ID, asset.ID)
	require.NoError(t, err)
	require.True(t, after.Disposed)
	require.Len(t, after.DisposalHistory, 1)
}
