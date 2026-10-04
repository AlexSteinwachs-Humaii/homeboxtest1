package repo

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/attachment"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/entity"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/group"
)

var ErrRetainedDisposal = errors.New("retained disposal history and destruction evidence cannot be removed or reclassified")

// Lock the owning row before inspecting history. Every disposal and destructive
// attachment operation uses this same write lock, on SQLite and PostgreSQL, so
// evidence validation cannot race an attachment deletion or reclassification.
func lockDisposalEntity(ctx context.Context, db *ent.Client, gid, id uuid.UUID) (*ent.Entity, error) {
	count, err := db.Entity.Update().Where(entity.ID(id), entity.HasGroupWith(group.ID(gid))).SetUpdatedAt(time.Now().UTC()).Save(ctx)
	if err != nil {
		return nil, err
	}
	if count == 0 {
		return nil, &ent.NotFoundError{}
	}
	return db.Entity.Get(ctx, id)
}

func (r *AttachmentRepo) withRetentionLock(ctx context.Context, gid, id uuid.UUID, change func(*AttachmentRepo) error) error {
	if r.retentionTx {
		return change(r)
	}
	tx, err := r.db.Tx(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	a, err := tx.Attachment.Query().Where(attachment.ID(id), attachment.HasEntityWith(entity.HasGroupWith(group.ID(gid)))).WithEntity().Only(ctx)
	if err != nil {
		return err
	}
	if _, err = lockDisposalEntity(ctx, tx.Client(), gid, a.Edges.Entity.ID); err != nil {
		return err
	}
	copy := *r
	copy.db, copy.retentionTx = tx.Client(), true
	if err := change(&copy); err != nil {
		return err
	}
	return tx.Commit()
}

func (r *AttachmentRepo) retainedEvidence(ctx context.Context, id uuid.UUID) (bool, error) {
	e, err := r.db.Attachment.Query().Where(attachment.ID(id)).QueryEntity().Only(ctx)
	if err != nil {
		return false, err
	}
	for _, d := range e.DisposalHistory {
		if d.Destruction != nil {
			for _, ref := range d.Destruction.Evidence {
				if ref.AttachmentID == id {
					return true, nil
				}
			}
		}
	}
	return false, nil
}

func (r *EntityRepository) deleteWithRetentionLock(ctx context.Context, gid, id uuid.UUID) error {
	tx, err := r.db.Tx(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	e, err := lockDisposalEntity(ctx, tx.Client(), gid, id)
	if err != nil {
		return err
	}
	if e.Disposed || len(e.DisposalHistory) > 0 {
		return ErrRetainedDisposal
	}
	copy, attachments := *r, *r.attachments
	copy.db = tx.Client()
	attachments.db, attachments.retentionTx = tx.Client(), true
	copy.attachments = &attachments
	if err := copy.deleteByGroup(ctx, gid, id); err != nil {
		return err
	}
	return tx.Commit()
}
