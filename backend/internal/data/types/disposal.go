package types

import (
	"time"

	"github.com/google/uuid"
)

// Disposal records a completed offboarding. It is separate from archive and sale
// metadata. There is no restoration workflow: an entity has at most one record.
// Destruction records are accepted only with an evidence-backed attestation.
type Disposal struct {
	Route       string                  `json:"route"`
	SubmittedBy uuid.UUID               `json:"submittedBy"`
	SubmittedAt time.Time               `json:"submittedAt"`
	Destruction *DestructionAttestation `json:"destruction,omitempty" extensions:"x-nullable,x-omitempty"`
}

// DestructionDeclaration is the statement accepted by the authenticated custodian.
const DestructionDeclaration = "I declare that this asset was destroyed on the stated date using the stated method, and that the attached evidence supports my declaration."

// DestructionEvidence references an existing uploaded attachment, not a remote URL.
type DestructionEvidence struct {
	AttachmentID uuid.UUID `json:"attachmentId"`
	Kind         string    `json:"kind"`
}

// DestructionAttestation is retained in the same JSON record as server attribution.
type DestructionAttestation struct {
	Declaration string                `json:"declaration"`
	Date        Date                  `json:"date"`
	Method      string                `json:"method"`
	Evidence    []DestructionEvidence `json:"evidence"`
}
