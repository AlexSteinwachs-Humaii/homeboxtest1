package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/hay-kot/httpkit/errchain"
	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/internal/core/services"
	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
	"github.com/sysadminsmedia/homebox/backend/internal/sys/validate"
)

func TestExportTenantAuthorization(t *testing.T) {
	authorized, foreign := uuid.New(), uuid.New()
	for _, viaHeader := range []bool{false, true} {
		for _, gid := range []uuid.UUID{authorized, foreign} {
			r := httptest.NewRequest(http.MethodGet, "/api/v1/entities/export?filtered=true", nil)
			if viaHeader {
				r.Header.Set("X-Tenant", gid.String())
			} else {
				q := r.URL.Query()
				q.Set("tenant", gid.String())
				r.URL.RawQuery = q.Encode()
			}
			r = r.WithContext(services.SetUserCtx(r.Context(), &repo.UserOut{DefaultGroupID: authorized, GroupIDs: []uuid.UUID{authorized}}, ""))
			reached := false
			next := errchain.HandlerFunc(func(w http.ResponseWriter, r *http.Request) error {
				reached = true
				require.Equal(t, authorized, services.NewContext(r.Context()).GID)
				return nil
			})
			err := (&app{}).mwTenant(next).ServeHTTP(httptest.NewRecorder(), r)
			if gid == foreign {
				var reqErr *validate.RequestError
				require.ErrorAs(t, err, &reqErr)
				require.Equal(t, http.StatusForbidden, reqErr.Status)
				require.False(t, reached, "unauthorized collection must not reach the export handler")
			} else {
				require.NoError(t, err)
				require.True(t, reached)
			}
		}
	}
}
