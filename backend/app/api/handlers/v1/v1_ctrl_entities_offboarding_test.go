package v1

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/internal/core/services"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent"
	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
	"github.com/sysadminsmedia/homebox/backend/internal/data/types"
	"github.com/sysadminsmedia/homebox/backend/internal/sys/config"
	"github.com/sysadminsmedia/homebox/backend/internal/sys/validate"
	_ "github.com/sysadminsmedia/homebox/backend/pkgs/cgofreesqlite"
)

func TestEntityOffboardingHandler(t *testing.T) {
	ctx := context.Background()
	db, err := ent.Open("sqlite3", "file:"+uuid.NewString()+"?mode=memory&cache=shared&_fk=1&_time_format=sqlite")
	require.NoError(t, err)
	defer func() { _ = db.Close() }()
	require.NoError(t, db.Schema.Create(ctx))
	repos := repo.New(db, nil, config.Storage{}, "", config.Thumbnail{})
	grp, err := repos.Groups.GroupCreate(ctx, "offboard", uuid.Nil)
	require.NoError(t, err)
	et, err := repos.EntityTypes.GetDefault(ctx, grp.ID, false)
	require.NoError(t, err)
	user := &repo.UserOut{ID: uuid.New(), DefaultGroupID: grp.ID}
	ctrl := &V1Controller{repo: repos, svc: services.New(repos)}
	auth := services.SetTenantCtx(services.SetUserCtx(ctx, user, ""), grp.ID)
	call := func(id uuid.UUID, body string, tenant uuid.UUID) (*httptest.ResponseRecorder, error) {
		req := httptest.NewRequest(http.MethodPost, "/entities/"+id.String()+"/offboarding", strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		route := chi.NewRouteContext()
		route.URLParams.Add("id", id.String())
		req = req.WithContext(context.WithValue(services.SetTenantCtx(auth, tenant), chi.RouteCtxKey, route))
		w := httptest.NewRecorder()
		return w, ctrl.HandleEntityOffboard()(w, req)
	}
	for _, disposalRoute := range []string{"sale", "donation", "recycling"} {
		t.Run(disposalRoute, func(t *testing.T) {
			asset, err := repos.Entities.Create(ctx, grp.ID, repo.EntityCreate{Name: "asset", EntityTypeID: et.ID})
			require.NoError(t, err)
			_, err = call(asset.ID, `{"route":"destruction"}`, grp.ID)
			var requestErr *validate.RequestError
			require.True(t, errors.As(err, &requestErr))
			require.Equal(t, http.StatusBadRequest, requestErr.Status)
			_, err = call(asset.ID, `{"route":"sale"}`, uuid.New())
			require.True(t, errors.As(err, &requestErr))
			require.Equal(t, http.StatusNotFound, requestErr.Status)
			_, err = call(asset.ID, `{"route":"unknown"}`, grp.ID)
			require.Error(t, err)
			unchanged, err := repos.Entities.GetOneByGroup(ctx, grp.ID, asset.ID)
			require.NoError(t, err)
			require.False(t, unchanged.Disposed)
			// Spoofed attribution is either rejected by strict decoding or ignored;
			// it must never override the authenticated user/server time.
			w, err := call(asset.ID, `{"route":"`+disposalRoute+`","submittedBy":"`+uuid.NewString()+`","submittedAt":"2000-01-01T00:00:00Z"}`, grp.ID)
			if err != nil {
				stillActive, readErr := repos.Entities.GetOneByGroup(ctx, grp.ID, asset.ID)
				require.NoError(t, readErr)
				require.False(t, stillActive.Disposed)
				w, err = call(asset.ID, `{"route":"`+disposalRoute+`"}`, grp.ID)
			}
			require.NoError(t, err)
			require.Equal(t, http.StatusOK, w.Code)
			var record types.Disposal
			require.NoError(t, json.Unmarshal(w.Body.Bytes(), &record))
			require.Equal(t, user.ID, record.SubmittedBy)
			require.False(t, record.SubmittedAt.IsZero())
			require.Equal(t, disposalRoute, record.Route)
			_, err = call(asset.ID, `{"route":"donation"}`, grp.ID)
			require.True(t, errors.As(err, &requestErr))
			require.Equal(t, http.StatusConflict, requestErr.Status)
		})
	}
}
