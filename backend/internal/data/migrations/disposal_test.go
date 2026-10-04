package migrations

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/google/uuid"
	"github.com/sysadminsmedia/homebox/backend/internal/data/types"
	"os"
	"strings"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/stretchr/testify/require"
	_ "github.com/sysadminsmedia/homebox/backend/pkgs/cgofreesqlite"
)

// Exercise the actual driver-specific upgrade scripts, not Ent schema creation.
// A temporary table and transaction isolate the optional PostgreSQL test.
func TestDisposalMigrationDefaults(t *testing.T) {
	for _, driver := range []string{"sqlite3", "postgres"} {
		t.Run(driver, func(t *testing.T) {
			sqlDriver, dsn := "sqlite3", ":memory:"
			if driver == "postgres" {
				sqlDriver, dsn = "pgx", os.Getenv("TEST_POSTGRES_DSN")
				if dsn == "" {
					t.Skip("TEST_POSTGRES_DSN not configured")
				}
			}
			db, err := sql.Open(sqlDriver, dsn)
			require.NoError(t, err)
			defer func() { _ = db.Close() }()
			tx, err := db.BeginTx(context.Background(), nil)
			require.NoError(t, err)
			defer func() { _ = tx.Rollback() }()
			_, err = tx.Exec("CREATE TEMPORARY TABLE entities (id INTEGER PRIMARY KEY, archived BOOLEAN NOT NULL DEFAULT false, sold_to TEXT)")
			require.NoError(t, err)
			_, err = tx.Exec("INSERT INTO entities (id, archived, sold_to) VALUES (1, false, ''), (2, true, 'legacy buyer')")
			require.NoError(t, err)
			fs, err := Migrations(driver)
			require.NoError(t, err)
			data, err := fs.ReadFile(driver + "/20261003120000_add_entity_disposal.sql")
			require.NoError(t, err)
			parts := strings.Split(string(data), "-- +goose Down")
			for _, stmt := range strings.Split(parts[0], ";") {
				if strings.TrimSpace(stmt) != "" {
					_, err = tx.Exec(stmt)
					require.NoError(t, err)
				}
			}
			for _, id := range []int{1, 2} {
				var disposed, archived bool
				var history sql.NullString
				require.NoError(t, tx.QueryRow(fmt.Sprintf("SELECT disposed, disposal_history, archived FROM entities WHERE id = %d", id)).Scan(&disposed, &history, &archived))
				require.False(t, disposed)
				require.False(t, history.Valid)
				require.Equal(t, id == 2, archived)
			}
			_, err = tx.Exec("INSERT INTO entities (id) VALUES (3)")
			require.NoError(t, err)
			var disposed bool
			require.NoError(t, tx.QueryRow("SELECT disposed FROM entities WHERE id = 3").Scan(&disposed))
			require.False(t, disposed)

			history := []types.Disposal{{Route: "destruction", SubmittedBy: uuid.New(), SubmittedAt: time.Now().UTC().Truncate(time.Second), Destruction: &types.DestructionAttestation{Declaration: types.DestructionDeclaration, Date: types.DateFromString("2026-10-01"), Method: "Shredded", Evidence: []types.DestructionEvidence{{AttachmentID: uuid.New(), Kind: "certificate"}}}}}
			data, err = json.Marshal(history)
			require.NoError(t, err)
			placeholder := "?"
			if driver == "postgres" {
				placeholder = "$1"
			}
			_, err = tx.Exec("UPDATE entities SET disposed = true, disposal_history = "+placeholder+" WHERE id = 1", string(data))
			require.NoError(t, err)
			var stored string
			require.NoError(t, tx.QueryRow("SELECT disposed, disposal_history FROM entities WHERE id = 1").Scan(&disposed, &stored))
			require.True(t, disposed)
			var got []types.Disposal
			require.NoError(t, json.Unmarshal([]byte(stored), &got))
			require.Equal(t, history, got)
			for _, stmt := range strings.Split(parts[1], ";") {
				if strings.TrimSpace(stmt) != "" {
					_, err = tx.Exec(stmt)
					require.NoError(t, err)
				}
			}
			var soldTo string
			require.NoError(t, tx.QueryRow("SELECT sold_to FROM entities WHERE id = 2").Scan(&soldTo))
			require.Equal(t, "legacy buyer", soldTo)
		})
	}
}
