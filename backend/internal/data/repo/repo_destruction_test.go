package repo

import (
	"bytes"
	"context"
	"image"
	"image/png"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/attachment"
	"github.com/sysadminsmedia/homebox/backend/internal/data/types"
)

func TestDestructionAttestationValidationAndPersistence(t *testing.T) {
	ctx := context.Background()
	asset := useEntities(t, 1)[0]
	var photoBytes bytes.Buffer
	require.NoError(t, png.Encode(&photoBytes, image.NewRGBA(image.Rect(0, 0, 1, 1))))
	photo, err := tRepos.Attachments.Create(ctx, asset.ID, ItemCreateAttachment{Title: "Destruction photo", Content: &photoBytes}, attachment.TypePhoto, false)
	require.NoError(t, err)
	cert, err := tRepos.Attachments.Create(ctx, asset.ID, ItemCreateAttachment{Title: "Destruction certificate", Content: strings.NewReader("%PDF-1.7\nDestruction certificate")}, attachment.TypeAttachment, false)
	require.NoError(t, err)
	valid := func() EntityOffboarding {
		return EntityOffboarding{Route: "destruction", Destruction: &DestructionInput{Declared: true, Date: types.DateFromString("2026-10-01"), Method: "  Shredded  ", Evidence: []types.DestructionEvidence{{AttachmentID: photo.ID, Kind: "photo"}, {AttachmentID: cert.ID, Kind: "certificate"}}}}
	}
	foreignAsset := useEntities(t, 1)[0]
	otherGroup, err := tRepos.Groups.GroupCreate(ctx, "foreign evidence", uuid.Nil)
	require.NoError(t, err)
	foreignType, err := tRepos.EntityTypes.GetDefault(ctx, otherGroup.ID, false)
	require.NoError(t, err)
	foreignCollection, err := tClient.Entity.Create().SetGroupID(otherGroup.ID).SetEntityTypeID(foreignType.ID).SetName("foreign").Save(ctx)
	require.NoError(t, err)
	cases := []struct {
		name   string
		mutate func(*DestructionInput)
	}{
		{"no consent", func(d *DestructionInput) { d.Declared = false }},
		{"no date", func(d *DestructionInput) { d.Date = types.Date{} }},
		{"no method", func(d *DestructionInput) { d.Method = " \n\t " }},
		{"no evidence", func(d *DestructionInput) { d.Evidence = nil }},
		{"missing evidence", func(d *DestructionInput) { d.Evidence[0].AttachmentID = uuid.New() }},
		{"duplicate evidence", func(d *DestructionInput) { d.Evidence[1] = d.Evidence[0] }},
		{"wrong kind", func(d *DestructionInput) { d.Evidence[0].Kind = "manual" }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			input := valid()
			c.mutate(input.Destruction)
			_, err := tRepos.Entities.OffboardByGroup(ctx, tGroup.ID, asset.ID, tUser.ID, input)
			require.ErrorIs(t, err, ErrDestructionAttestationRequired)
			active, err := tRepos.Entities.GetOneByGroup(ctx, tGroup.ID, asset.ID)
			require.NoError(t, err)
			require.False(t, active.Disposed)
			require.Empty(t, active.DisposalHistory)
		})
	}
	for _, c := range []struct {
		name, typ, mime, path string
		entity                uuid.UUID
	}{
		{"foreign asset", "photo", "image/jpeg", "upload", foreignAsset.ID},
		{"foreign collection", "photo", "image/jpeg", "upload", foreignCollection.ID},
		{"external link", "photo", MimeTypeLinkURL, "https://example.com", asset.ID},
		{"thumbnail", "thumbnail", "image/jpeg", "upload", asset.ID},
		{"non image photo", "photo", "text/plain", "upload", asset.ID},
		{"empty upload path", "photo", "image/jpeg", "", asset.ID},
		{"blank upload path", "photo", "image/jpeg", " \n\t ", asset.ID},
	} {
		t.Run(c.name, func(t *testing.T) {
			att, err := tClient.Attachment.Create().SetEntityID(c.entity).SetType(attachment.Type(c.typ)).SetMimeType(c.mime).SetPath(c.path).Save(ctx)
			require.NoError(t, err)
			defer func() { _ = tClient.Attachment.DeleteOneID(att.ID).Exec(ctx) }()
			input := valid()
			input.Destruction.Evidence = []types.DestructionEvidence{{AttachmentID: att.ID, Kind: "photo"}}
			_, err = tRepos.Entities.OffboardByGroup(ctx, tGroup.ID, asset.ID, tUser.ID, input)
			require.ErrorIs(t, err, ErrDestructionAttestationRequired)
		})
	}
	unchanged, err := tRepos.Entities.GetOneByGroup(ctx, tGroup.ID, asset.ID)
	require.NoError(t, err)
	require.False(t, unchanged.Disposed)
	require.Empty(t, unchanged.DisposalHistory)
	record, err := tRepos.Entities.OffboardByGroup(ctx, tGroup.ID, asset.ID, tUser.ID, valid())
	require.NoError(t, err)
	require.Equal(t, types.DestructionDeclaration, record.Destruction.Declaration)
	require.Equal(t, "Shredded", record.Destruction.Method)
	require.Equal(t, "2026-10-01", record.Destruction.Date.String())
	require.Equal(t, tUser.ID, record.SubmittedBy)
	require.False(t, record.SubmittedAt.IsZero())
	retained, err := tRepos.Entities.GetOneByGroup(ctx, tGroup.ID, asset.ID)
	require.NoError(t, err)
	require.True(t, retained.Disposed)
	require.Equal(t, []types.Disposal{record}, retained.DisposalHistory)
	_, err = tRepos.Entities.OffboardByGroup(ctx, tGroup.ID, asset.ID, tUser.ID, valid())
	require.ErrorIs(t, err, ErrAlreadyDisposed)
}
