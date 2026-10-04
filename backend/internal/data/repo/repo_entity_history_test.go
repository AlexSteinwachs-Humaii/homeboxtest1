package repo

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestEntityInventoryLifecycleSearch(t *testing.T) {
	ctx := context.Background()
	grp, err := tRepos.Groups.GroupCreate(ctx, "lifecycle search", uuid.Nil)
	require.NoError(t, err)
	et, err := tRepos.EntityTypes.GetDefault(ctx, grp.ID, false)
	require.NoError(t, err)
	locationET, err := tRepos.EntityTypes.GetDefault(ctx, grp.ID, true)
	require.NoError(t, err)
	location, err := tRepos.Entities.Create(ctx, grp.ID, EntityCreate{Name: "storage", EntityTypeID: locationET.ID})
	require.NoError(t, err)
	assetID := AssetID(100)
	create := func(name string, archived, disposed bool) EntityOut {
		assetID++
		item, err := tRepos.Entities.Create(ctx, grp.ID, EntityCreate{Name: name, ParentID: location.ID, Quantity: 1, EntityTypeID: et.ID, AssetID: assetID})
		require.NoError(t, err)
		_, err = tClient.Entity.UpdateOneID(item.ID).SetArchived(archived).Save(ctx)
		require.NoError(t, err)
		if disposed {
			_, err = tRepos.Entities.OffboardByGroup(ctx, grp.ID, item.ID, tUser.ID, EntityOffboarding{Route: "sale"})
			require.NoError(t, err)
		}
		return item
	}
	active := create("match active", false, false)
	archived := create("match archived", true, false)
	disposed := create("match disposed", false, true)
	archivedDisposed := create("match historical archived", true, true)
	query := func(q EntityQuery) PaginationResult[EntitySummary] {
		result, err := tRepos.Entities.QueryByGroup(ctx, grp.ID, q)
		require.NoError(t, err)
		return result
	}
	all := EntityQuery{Page: -1, PageSize: -1}
	result := query(all)
	require.Equal(t, 1, result.Total)
	require.Equal(t, active.ID, result.Items[0].ID)
	result = query(EntityQuery{Page: 1, PageSize: 1})
	require.Equal(t, 1, result.Total)
	require.Len(t, result.Items, 1)
	all.IncludeArchived = true
	result = query(all)
	require.Equal(t, 2, result.Total)
	require.ElementsMatch(t, []uuid.UUID{active.ID, archived.ID}, []uuid.UUID{result.Items[0].ID, result.Items[1].ID})
	all.OnlyOffboarded = true
	all.IncludeArchived = false
	result = query(all)
	require.Equal(t, 2, result.Total)
	require.ElementsMatch(t, []uuid.UUID{disposed.ID, archivedDisposed.ID}, []uuid.UUID{result.Items[0].ID, result.Items[1].ID})
	for page := 1; page <= 2; page++ {
		result = query(EntityQuery{OnlyOffboarded: true, Search: "match", Page: page, PageSize: 1})
		require.Equal(t, 2, result.Total)
		require.Len(t, result.Items, 1)
		require.True(t, result.Items[0].Disposed)
	}
	result = query(EntityQuery{OnlyOffboarded: true, Search: "historical", Page: -1, PageSize: -1})
	require.Equal(t, 1, result.Total)
	require.Equal(t, archivedDisposed.ID, result.Items[0].ID)
	result = query(EntityQuery{OnlyOffboarded: true, AssetID: disposed.AssetID, Page: -1, PageSize: -1})
	require.Equal(t, 1, result.Total)
	require.Equal(t, disposed.ID, result.Items[0].ID)
	tag, err := tClient.Tag.Create().SetName("history tag").SetGroupID(grp.ID).Save(ctx)
	require.NoError(t, err)
	_, err = tClient.Entity.UpdateOneID(disposed.ID).AddTagIDs(tag.ID).Save(ctx)
	require.NoError(t, err)
	result = query(EntityQuery{OnlyOffboarded: true, TagIDs: []uuid.UUID{tag.ID}, Page: -1, PageSize: -1})
	require.Equal(t, 1, result.Total)
	require.Equal(t, disposed.ID, result.Items[0].ID)
	result = query(EntityQuery{OnlyOffboarded: true, TagIDs: []uuid.UUID{tag.ID}, NegateTags: true, Page: -1, PageSize: -1})
	require.Equal(t, 1, result.Total)
	require.Equal(t, archivedDisposed.ID, result.Items[0].ID)
	_, err = tClient.EntityField.Create().SetEntityID(disposed.ID).SetName("condition").SetType("text").SetTextValue("destroyed").Save(ctx)
	require.NoError(t, err)
	result = query(EntityQuery{OnlyOffboarded: true, Fields: []FieldQuery{{Name: "condition", Value: "destroyed"}}, Page: -1, PageSize: -1})
	require.Equal(t, 1, result.Total)
	require.Equal(t, disposed.ID, result.Items[0].ID)
	result = query(EntityQuery{OnlyOffboarded: true, ParentIDs: []uuid.UUID{location.ID}, Page: -1, PageSize: -1})
	require.Equal(t, 2, result.Total)
	result = query(EntityQuery{OnlyOffboarded: true, ParentIDs: []uuid.UUID{uuid.New()}, Page: -1, PageSize: -1})
	require.Zero(t, result.Total)
	_, err = tClient.Attachment.Create().SetEntityID(disposed.ID).SetType("photo").SetPrimary(true).SetPath("uploaded/photo").SetMimeType("image/png").Save(ctx)
	require.NoError(t, err)
	result = query(EntityQuery{OnlyOffboarded: true, OnlyWithPhoto: true, Page: -1, PageSize: -1})
	require.Equal(t, 1, result.Total)
	require.Equal(t, disposed.ID, result.Items[0].ID)
	result = query(EntityQuery{OnlyOffboarded: true, OnlyWithoutPhoto: true, Page: -1, PageSize: -1})
	require.Equal(t, 1, result.Total)
	require.Equal(t, archivedDisposed.ID, result.Items[0].ID)
	containers, err := tRepos.Entities.GetAllContainers(ctx, grp.ID, ContainerQuery{})
	require.NoError(t, err)
	require.Len(t, containers, 1)
	require.EqualValues(t, 1, containers[0].ItemCount)
	isLocation := true
	locations := query(EntityQuery{IsLocation: &isLocation, Page: -1, PageSize: -1})
	require.Len(t, locations.Items, 1)
	require.EqualValues(t, 1, locations.Items[0].ItemCount)
	tree, err := tRepos.Entities.Tree(ctx, grp.ID, TreeQuery{WithItems: true})
	require.NoError(t, err)
	require.Len(t, tree, 1)
	// Tree's pre-existing archive behavior remains unchanged.
	require.Len(t, tree[0].Children, 2)
	for _, child := range tree[0].Children {
		require.Contains(t, []uuid.UUID{active.ID, archived.ID}, child.ID)
	}
	other, err := tRepos.Groups.GroupCreate(ctx, "other collection", uuid.Nil)
	require.NoError(t, err)
	otherET, err := tRepos.EntityTypes.GetDefault(ctx, other.ID, false)
	require.NoError(t, err)
	foreign, err := tRepos.Entities.Create(ctx, other.ID, EntityCreate{Name: "match foreign", EntityTypeID: otherET.ID})
	require.NoError(t, err)
	_, err = tRepos.Entities.OffboardByGroup(ctx, other.ID, foreign.ID, tUser.ID, EntityOffboarding{Route: "recycling"})
	require.NoError(t, err)
	result, err = tRepos.Entities.QueryByGroup(ctx, other.ID, all)
	require.NoError(t, err)
	require.Equal(t, 1, result.Total)
	require.Equal(t, foreign.ID, result.Items[0].ID)
	result = query(all)
	require.Equal(t, 2, result.Total)
	detail, err := tRepos.Entities.GetOneByGroup(ctx, grp.ID, archivedDisposed.ID)
	require.NoError(t, err)
	require.Len(t, detail.DisposalHistory, 1)
	_, err = tRepos.Entities.GetOneByGroup(ctx, other.ID, archivedDisposed.ID)
	require.Error(t, err)
	stats, err := tRepos.Groups.StatsGroup(ctx, grp.ID)
	require.NoError(t, err)
	require.EqualValues(t, 1, stats.TotalItems)
}
