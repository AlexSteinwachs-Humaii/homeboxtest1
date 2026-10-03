package v1

import (
	"context"
	"encoding/csv"
	"github.com/sysadminsmedia/homebox/backend/internal/core/services"
	"github.com/sysadminsmedia/homebox/backend/internal/core/services/reporting/eventbus"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent"
	"github.com/sysadminsmedia/homebox/backend/internal/sys/config"
	"github.com/sysadminsmedia/homebox/backend/internal/sys/validate"
	_ "github.com/sysadminsmedia/homebox/backend/pkgs/cgofreesqlite"
	"net/http"
	"net/http/httptest"
	"net/url"
	"slices"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
)

func TestExtractFilteredExportQuery(t *testing.T) {
	parent, tag := uuid.New(), uuid.New()
	q, filtered, err := extractFilteredExportQuery(url.Values{
		"filtered": {"true"}, "q": {"#000-123"}, "parentIds": {parent.String()}, "tags": {tag.String()},
		"includeArchived": {"true"}, "page": {"1"}, "pageSize": {"10"}, "isLocation": {"true"},
	})
	require.NoError(t, err)
	require.True(t, filtered)
	require.Equal(t, []uuid.UUID{parent}, q.ParentIDs)
	require.Equal(t, []uuid.UUID{tag}, q.TagIDs)
	require.True(t, q.IncludeArchived)
	require.Empty(t, q.Search)
	require.Equal(t, repo.AssetID(123), q.AssetID)
	require.Nil(t, q.IsLocation)
	require.Zero(t, q.PageSize)

	q, filtered, err = extractFilteredExportQuery(url.Values{"filtered": {"true"}})
	require.NoError(t, err)
	require.True(t, filtered)
	require.False(t, q.IncludeArchived)

	for _, params := range []url.Values{nil, {"q": {"drill"}, "tags": {"invalid"}}, {"filtered": {"false"}}} {
		_, filtered, err := extractFilteredExportQuery(params)
		require.NoError(t, err)
		require.False(t, filtered, "legacy callers must keep full-collection behavior")
	}
	for _, params := range []url.Values{
		{"filtered": {"invalid"}}, {"filtered": {""}}, {"filtered": {"true", "false"}},
		{"filtered": {"true"}, "includeArchived": {"invalid"}},
		{"filtered": {"true"}, "includeArchived": {""}},
		{"filtered": {"true"}, "parentIds": {"invalid"}},
		{"filtered": {"true"}, "tags": {tag.String(), "invalid"}},
		{"filtered": {"true"}, "tags": {uuid.Nil.String()}},
	} {
		_, _, err := extractFilteredExportQuery(params)
		require.Error(t, err, "malformed filters must not silently widen an export")
	}
}

func TestExportSearchMatchesListAssetParsing(t *testing.T) {
	for _, search := range []string{"#000-123", "#invalid", "MixedCase", ""} {
		q, _, err := extractFilteredExportQuery(url.Values{"filtered": {"true"}, "q": {search}})
		require.NoError(t, err)
		list := repo.EntityQuery{Search: search}
		resolveAssetSearch(&list)
		require.Equal(t, list.Search, q.Search)
		require.Equal(t, list.AssetID, q.AssetID)
	}
}

// This exercises the real repository, service, serializer and HTTP handler.
func TestHandleEntitiesExportModes(t *testing.T) {
	ctx := context.Background()
	client, err := ent.Open("sqlite3", "file:export-handler-"+uuid.NewString()+"?mode=memory&cache=shared&_fk=1&_time_format=sqlite")
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, client.Close()) })
	require.NoError(t, client.Schema.Create(ctx))
	repos := repo.New(client, eventbus.New(), config.Storage{}, "", config.Thumbnail{})
	svc := services.New(repos)
	group, err := repos.Groups.GroupCreate(ctx, "handler-export", uuid.Nil)
	require.NoError(t, err)
	locType, err := repos.EntityTypes.GetDefault(ctx, group.ID, true)
	require.NoError(t, err)
	itemType, err := repos.EntityTypes.GetDefault(ctx, group.ID, false)
	require.NoError(t, err)
	location, err := repos.Entities.Create(ctx, group.ID, repo.EntityCreate{Name: "Room", EntityTypeID: locType.ID})
	require.NoError(t, err)
	_, err = repos.Entities.Create(ctx, group.ID, repo.EntityCreate{Name: "Visible drill", ParentID: location.ID, EntityTypeID: itemType.ID})
	require.NoError(t, err)
	archived, err := repos.Entities.Create(ctx, group.ID, repo.EntityCreate{Name: "Archived drill", ParentID: location.ID, EntityTypeID: itemType.ID})
	require.NoError(t, err)
	_, err = client.Entity.UpdateOneID(archived.ID).SetArchived(true).Save(ctx)
	require.NoError(t, err)
	foreign, err := repos.Groups.GroupCreate(ctx, "foreign-export", uuid.Nil)
	require.NoError(t, err)
	_, err = repos.Entities.Create(ctx, foreign.ID, repo.EntityCreate{Name: "Secret drill"})
	require.NoError(t, err)
	ctrl := &V1Controller{repo: repos, svc: svc, config: &config.Config{}}
	for _, tc := range []struct {
		query string
		names []string
	}{
		{"", []string{"Room", "Visible drill", "Archived drill"}},
		{"?filtered=true", []string{"Visible drill"}},
		{"?filtered=true&q=DRILL&includeArchived=true&pageSize=1", []string{"Visible drill", "Archived drill"}},
	} {
		t.Run(tc.query, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodGet, "/api/v1/entities/export"+tc.query, nil)
			r = r.WithContext(services.SetTenantCtx(ctx, group.ID))
			w := httptest.NewRecorder()
			require.NoError(t, ctrl.HandleEntitiesExport()(w, r))
			require.Equal(t, "text/csv", w.Header().Get("Content-Type"))
			require.Contains(t, w.Header().Get("Content-Disposition"), ".csv")
			rows, err := csv.NewReader(strings.NewReader(w.Body.String())).ReadAll()
			require.NoError(t, err)
			nameCol := slices.Index(rows[0], "HB.name")
			require.NotEqual(t, -1, nameCol)
			names := []string{}
			for _, row := range rows[1:] {
				names = append(names, row[nameCol])
			}
			require.ElementsMatch(t, tc.names, names)
		})
	}
	r := httptest.NewRequest(http.MethodGet, "/api/v1/entities/export?filtered=true&tags=malformed", nil)
	w := httptest.NewRecorder()
	err = ctrl.HandleEntitiesExport()(w, r)
	var reqErr *validate.RequestError
	require.ErrorAs(t, err, &reqErr)
	require.Equal(t, http.StatusBadRequest, reqErr.Status)
	require.Empty(t, w.Body.String())
	require.Empty(t, w.Header().Get("Content-Disposition"))
}
