package types

import (
	"time"

	"github.com/google/uuid"
)

// Disposal records a completed offboarding. It is separate from archive and sale
// metadata. There is no restoration workflow: an entity has at most one record.
// Destruction records will only be accepted through the attestation workflow.
type Disposal struct {
	Route       string    `json:"route"`
	SubmittedBy uuid.UUID `json:"submittedBy"`
	SubmittedAt time.Time `json:"submittedAt"`
}
