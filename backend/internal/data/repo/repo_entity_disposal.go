package repo

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/entity"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/group"
	"github.com/sysadminsmedia/homebox/backend/internal/data/types"
)

var (
	ErrInvalidDisposal                = errors.New("invalid disposal route or submitting user")
	ErrDestructionAttestationRequired = errors.New("destruction requires the validated attestation workflow")
	ErrAlreadyDisposed                = errors.New("asset is already offboarded")
)

type EntityOffboarding struct {
	Route string `json:"route" validate:"required,oneof=sale donation recycling destruction"`
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
		// Never expose an unvalidated destruction transition. The subsequent
		// attestation story will supply the evidence-backed completion path.
		return types.Disposal{}, ErrDestructionAttestationRequired
	default:
		return types.Disposal{}, ErrInvalidDisposal
	}
	if id == uuid.Nil || gid == uuid.Nil {
		return types.Disposal{}, &ent.NotFoundError{}
	}
	if err := assertEntityInGroup(ctx, r.db.Entity, gid, id); err != nil {
		return types.Disposal{}, err
	}
	record := types.Disposal{Route: input.Route, SubmittedBy: uid, SubmittedAt: time.Now().UTC()}
	count, err := r.db.Entity.Update().Where(
		entity.IDEQ(id), entity.HasGroupWith(group.IDEQ(gid)), entity.DisposedEQ(false),
	).SetDisposed(true).SetDisposalHistory([]types.Disposal{record}).Save(ctx)
	if err != nil {
		return types.Disposal{}, err
	}
	if count == 0 {
		return types.Disposal{}, ErrAlreadyDisposed
	}
	r.publishMutationEvent(gid)
	return record, nil
}
