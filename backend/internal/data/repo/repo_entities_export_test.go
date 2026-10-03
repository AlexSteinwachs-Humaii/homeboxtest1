package repo

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestGetFilteredInventory(t *testing.T) {
	ctx := context.Background()
	g, err := tRepos.Groups.GroupCreate(ctx, "filtered-export-"+uuid.NewString(), uuid.Nil)
	require.NoError(t, err)
	itemType, err := tRepos.EntityTypes.GetDefault(ctx, g.ID, false)
	require.NoError(t, err)
	locType, err := tRepos.EntityTypes.GetDefault(ctx, g.ID, true)
	require.NoError(t, err)
	root, err := tRepos.Tags.Create(ctx, g.ID, TagCreate{Name: "root"})
	require.NoError(t, err)
	childTag, err := tRepos.Tags.Create(ctx, g.ID, TagCreate{Name: "child", ParentID: root.ID})
	require.NoError(t, err)
	otherTag, err := tRepos.Tags.Create(ctx, g.ID, TagCreate{Name: "other"})
	require.NoError(t, err)
	create := func(name string, typ, parent uuid.UUID, tags []uuid.UUID) EntityOut {
		e, err := tRepos.Entities.Create(ctx, g.ID, EntityCreate{Name: name, EntityTypeID: typ, ParentID: parent, TagIDs: tags})
		require.NoError(t, err)
		return e
	}
	loc := create("Workbench", locType.ID, uuid.Nil, nil)
	nestedLoc := create("Drawer", locType.ID, loc.ID, nil)
	direct := create("MixedCase drill", itemType.ID, loc.ID, []uuid.UUID{childTag.ID})
	second := create("MixedCase saw", itemType.ID, loc.ID, []uuid.UUID{otherTag.ID})
	nested := create("Nested drill", itemType.ID, nestedLoc.ID, []uuid.UUID{root.ID})
	archived := create("Old drill", itemType.ID, loc.ID, []uuid.UUID{childTag.ID})
	_, err = tRepos.Entities.db.Entity.UpdateOneID(archived.ID).SetArchived(true).Save(ctx)
	require.NoError(t, err)
	require.NoError(t, tRepos.Entities.SetAssetID(ctx, g.ID, direct.ID, AssetID(123)))
	foreignGID, foreignTag, foreignType := makeForeignGroup(t)
	foreign, err := tRepos.Entities.Create(ctx, foreignGID, EntityCreate{Name: "MixedCase drill", EntityTypeID: foreignType, TagIDs: []uuid.UUID{foreignTag}})
	require.NoError(t, err)
	ids := func(rows []EntityOut) []uuid.UUID {
		out := make([]uuid.UUID, len(rows))
		for i := range rows {
			out[i] = rows[i].ID
		}
		return out
	}
	cases := []struct {
		name string
		q    EntityQuery
		want []uuid.UUID
	}{
		{"defaults", EntityQuery{}, []uuid.UUID{direct.ID, second.ID, nested.ID}},
		{"text", EntityQuery{Search: "mIXEDcASE"}, []uuid.UUID{direct.ID, second.ID}},
		{"asset", EntityQuery{AssetID: AssetID(123)}, []uuid.UUID{direct.ID}},
		{"direct parent", EntityQuery{ParentIDs: []uuid.UUID{loc.ID}}, []uuid.UUID{direct.ID, second.ID}},
		{"descendant tag", EntityQuery{TagIDs: []uuid.UUID{root.ID}}, []uuid.UUID{direct.ID, nested.ID}},
		{"any tag", EntityQuery{TagIDs: []uuid.UUID{root.ID, otherTag.ID}}, []uuid.UUID{direct.ID, second.ID, nested.ID}},
		{"combined", EntityQuery{Search: "DRILL", ParentIDs: []uuid.UUID{loc.ID}, TagIDs: []uuid.UUID{root.ID}}, []uuid.UUID{direct.ID}},
		{"archived", EntityQuery{IncludeArchived: true}, []uuid.UUID{direct.ID, second.ID, nested.ID, archived.ID}},
		{"foreign parent", EntityQuery{ParentIDs: []uuid.UUID{foreign.ID}}, nil},
		{"foreign tag", EntityQuery{TagIDs: []uuid.UUID{foreignTag}}, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rows, err := tRepos.Entities.GetFilteredInventory(ctx, g.ID, tc.q)
			require.NoError(t, err)
			require.ElementsMatch(t, tc.want, ids(rows))
			listQuery := tc.q
			listQuery.Page = -1
			listQuery.PageSize = -1
			list, err := tRepos.Entities.QueryByGroup(ctx, g.ID, listQuery)
			require.NoError(t, err)
			listIDs := make([]uuid.UUID, len(list.Items))
			for i := range list.Items {
				listIDs[i] = list.Items[i].ID
			}
			require.ElementsMatch(t, listIDs, ids(rows))
			for _, row := range rows {
				require.NotNil(t, row.EntityType)
				require.False(t, row.EntityType.IsLocation)
			}
		})
	}
	for i := 0; i < 75; i++ {
		create(fmt.Sprintf("Bulk %03d", i), itemType.ID, loc.ID, nil)
	}
	rows, err := tRepos.Entities.GetFilteredInventory(ctx, g.ID, EntityQuery{Search: "Bulk", Page: 1, PageSize: 10, FilterChildren: true})
	require.NoError(t, err)
	require.Len(t, rows, 75)
	// Ordering is stable and full records retain CSV-required relationships.
	require.Equal(t, "Bulk 000", rows[0].Name)
	require.Equal(t, loc.ID, rows[0].Parent.ID)
	all, err := tRepos.Entities.GetAll(ctx, g.ID)
	require.NoError(t, err)
	require.Len(t, all, 81) // Legacy includes both locations and archived inventory.
}
