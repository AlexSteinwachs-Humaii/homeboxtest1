package repo

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/attachment"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/entity"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/group"
	"github.com/sysadminsmedia/homebox/backend/internal/data/types"
)

var (
	ErrInvalidDisposal                = errors.New("invalid disposal route or submitting user")
	ErrDestructionAttestationRequired = errors.New("destruction requires declaration consent, date, method and uploaded photo or certificate evidence")
	ErrAlreadyDisposed                = errors.New("asset is already offboarded")
)

type EntityOffboarding struct {
	Route       string            `json:"route" validate:"required,oneof=sale donation recycling destruction"`
	Destruction *DestructionInput `json:"destruction,omitempty" extensions:"x-nullable,x-omitempty"`
}

// Consent accepts types.DestructionDeclaration; attribution is never client input.
type DestructionInput struct {
	Declared bool                        `json:"declared"`
	Date     types.Date                  `json:"date"`
	Method   string                      `json:"method"`
	Evidence []types.DestructionEvidence `json:"evidence"`
}

// OffboardByGroup atomically records the retained history and lifecycle change.
// A conditional update, rather than a read-then-write, makes only one competing
// request succeed. No archive, sale, attachment or asset data is removed.
func (r *EntityRepository) OffboardByGroup(ctx context.Context, gid, id, uid uuid.UUID, input EntityOffboarding) (types.Disposal, error) {
	if uid == uuid.Nil {
		return types.Disposal{}, ErrInvalidDisposal
	}
	switch input.Route {
	case "sale", "donation", "recycling":
	case "destruction":
		d := input.Destruction
		if d == nil || !d.Declared || d.Date.Time().IsZero() || strings.TrimSpace(d.Method) == "" || len(d.Evidence) == 0 {
			return types.Disposal{}, ErrDestructionAttestationRequired
		}
	default:
		return types.Disposal{}, ErrInvalidDisposal
	}
	if id == uuid.Nil || gid == uuid.Nil {
		return types.Disposal{}, &ent.NotFoundError{}
	}
	if err := assertEntityInGroup(ctx, r.db.Entity, gid, id); err != nil {
		return types.Disposal{}, err
	}
	// Validate references and write the complete disposal in one DB transaction.
	// Uploads have already completed via the existing attachment endpoint.
	tx, err := r.db.Tx(ctx)
	if err != nil {
		return types.Disposal{}, err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := lockDisposalEntity(ctx, tx.Client(), gid, id); err != nil {
		return types.Disposal{}, err
	}
	record := types.Disposal{Route: input.Route, SubmittedBy: uid, SubmittedAt: time.Now().UTC()}
	if input.Route == "destruction" {
		d := input.Destruction
		seen := make(map[uuid.UUID]bool)
		for _, ref := range d.Evidence {
			if ref.AttachmentID == uuid.Nil || seen[ref.AttachmentID] {
				return types.Disposal{}, ErrDestructionAttestationRequired
			}
			seen[ref.AttachmentID] = true
			a, err := tx.Attachment.Query().Where(attachment.IDEQ(ref.AttachmentID),
				attachment.HasEntityWith(entity.IDEQ(id), entity.HasGroupWith(group.IDEQ(gid)))).Only(ctx)
			if ent.IsNotFound(err) {
				return types.Disposal{}, ErrDestructionAttestationRequired
			}
			if err != nil {
				return types.Disposal{}, err
			}
			image := strings.HasPrefix(a.MimeType, "image/")
			valid := ref.Kind == "photo" && a.Type == attachment.TypePhoto && image ||
				ref.Kind == "certificate" && a.Type == attachment.TypeAttachment && (image || a.MimeType == "application/pdf")
			if !valid || strings.TrimSpace(a.Path) == "" || isExternalLink(a.MimeType) {
				return types.Disposal{}, ErrDestructionAttestationRequired
			}
		}
		record.Destruction = &types.DestructionAttestation{Declaration: types.DestructionDeclaration,
			Date: types.DateFromTime(d.Date.Time()), Method: strings.TrimSpace(d.Method),
			Evidence: append([]types.DestructionEvidence(nil), d.Evidence...)}
	}
	count, err := tx.Entity.Update().Where(
		entity.IDEQ(id), entity.HasGroupWith(group.IDEQ(gid)), entity.DisposedEQ(false),
	).SetDisposed(true).SetDisposalHistory([]types.Disposal{record}).Save(ctx)
	if err != nil {
		return types.Disposal{}, err
	}
	if count == 0 {
		return types.Disposal{}, ErrAlreadyDisposed
	}
	if err := tx.Commit(); err != nil {
		return types.Disposal{}, err
	}
	r.publishMutationEvent(gid)
	return record, nil
}
