package v1

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/internal/core/services"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent"
	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
	"github.com/sysadminsmedia/homebox/backend/internal/sys/config"
)

func TestEntitiesHistoricalQueryHandler(t *testing.T) {
	ctx := context.Background()
	db, err := ent.Open("sqlite3", "file:"+uuid.NewString()+"?mode=memory&cache=shared&_fk=1&_time_format=sqlite")
	require.NoError(t, err)
	defer func() { _ = db.Close() }()
	require.NoError(t, db.Schema.Create(ctx))
	repos := repo.New(db, nil, config.Storage{}, "", config.Thumbnail{})
	grp, err := repos.Groups.GroupCreate(ctx, "history", uuid.Nil)
	require.NoError(t, err)
	et, err := repos.EntityTypes.GetDefault(ctx, grp.ID, false)
	require.NoError(t, err)
	item, err := repos.Entities.Create(ctx, grp.ID, repo.EntityCreate{Name: "historical laptop", AssetID: 123, EntityTypeID: et.ID})
	require.NoError(t, err)
	user := &repo.UserOut{ID: uuid.New(), DefaultGroupID: grp.ID}
	_, err = repos.Entities.OffboardByGroup(ctx, grp.ID, item.ID, user.ID, repo.EntityOffboarding{Route: "donation"})
	require.NoError(t, err)
	_, err = db.Entity.UpdateOneID(item.ID).SetArchived(true).Save(ctx)
	require.NoError(t, err)
	ctrl := &V1Controller{repo: repos, svc: services.New(repos)}
	for _, tt := range []struct {
		query  string
		tenant uuid.UUID
		total  int
	}{
		{"", grp.ID, 0},
		{"?includeArchived=true", grp.ID, 0},
		{"?onlyOffboarded=true&q=laptop&page=1&pageSize=1", grp.ID, 1},
		{"?onlyOffboarded=true&q=%23123", grp.ID, 1},
		{"?onlyOffboarded=true&q=missing", grp.ID, 0},
		{"?onlyOffboarded=true", uuid.New(), 0},
	} {
		auth := services.SetTenantCtx(services.SetUserCtx(ctx, user, ""), tt.tenant)
		req := httptest.NewRequest(http.MethodGet, "/entities"+tt.query, nil).WithContext(auth)
		w := httptest.NewRecorder()
		require.NoError(t, ctrl.HandleEntitiesGetAll()(w, req))
		require.Equal(t, http.StatusOK, w.Code)
		var result repo.PaginationResult[repo.EntitySummary]
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &result))
		require.Equal(t, tt.total, result.Total, tt.query)
		require.Len(t, result.Items, tt.total)
		if tt.total > 0 {
			require.Equal(t, item.ID, result.Items[0].ID)
			require.True(t, result.Items[0].Disposed)
		}
	}
}
