package services

import (
	"bytes"
	"context"
	"encoding/csv"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
)

func TestFilteredCSVPreservesSchemaAndRelationships(t *testing.T) {
	ctx := context.Background()
	g, err := tRepos.Groups.GroupCreate(ctx, "filtered-csv-"+uuid.NewString(), uuid.Nil)
	require.NoError(t, err)
	locationType, err := tRepos.EntityTypes.GetDefault(ctx, g.ID, true)
	require.NoError(t, err)
	itemType, err := tRepos.EntityTypes.GetDefault(ctx, g.ID, false)
	require.NoError(t, err)
	create := func(name, ref string, parent uuid.UUID, location bool) repo.EntityOut {
		t.Helper()
		typ := itemType.ID
		if location {
			typ = locationType.ID
		}
		out, err := tRepos.Entities.Create(ctx, g.ID, repo.EntityCreate{Name: name, ImportRef: ref, ParentID: parent, EntityTypeID: typ, Quantity: 1})
		require.NoError(t, err)
		return out
	}
	fields := func(item repo.EntityOut, archived bool, names ...string) {
		t.Helper()
		fs := make([]repo.EntityFieldData, len(names))
		for i, name := range names {
			fs[i] = repo.EntityFieldData{Name: name, Type: "text", TextValue: "value,\"quoted\"\n日本語"}
		}
		parent := uuid.Nil
		if item.Parent != nil {
			parent = item.Parent.ID
		}
		_, err := tRepos.Entities.UpdateByGroup(ctx, g.ID, repo.EntityUpdate{ID: item.ID, Name: item.Name, EntityTypeID: item.EntityType.ID, ParentID: parent, Quantity: 1, Archived: archived, Fields: fs})
		require.NoError(t, err)
	}
	garage := create("Garage", "garage", uuid.Nil, true)
	shelf := create("Shelf", "shelf", garage.ID, true)
	box := create("Toolbox", "box-ref", shelf.ID, false)
	fields(box, true, "excluded-only")
	nested := create("Small box", "nested-ref", box.ID, false)
	first := create("Match,\"quoted\"\n日本語", "first", box.ID, false)
	fields(first, false, "Zulu", "Alpha")
	second := create("Match nested", "second", nested.ID, false)
	fields(second, false, "Beta")
	create("Match direct location", "third", shelf.ID, false)
	create("Match no parent", "fourth", uuid.Nil, false)

	full, err := tSvc.Entities.ExportCSV(ctx, g.ID, "https://homebox.example")
	require.NoError(t, err)
	require.Len(t, full, 9) // Locations, archived parent, nested parent, and all four matching rows.
	filtered, err := tSvc.Entities.ExportFilteredCSV(ctx, g.ID, "https://homebox.example", repo.EntityQuery{Search: "Match"})
	require.NoError(t, err)
	require.Len(t, filtered, 5)
	columns := func(header []string) map[string]int {
		result := map[string]int{}
		for i, name := range header {
			result[name] = i
		}
		return result
	}
	fc, allc := columns(filtered[0]), columns(full[0])
	require.Equal(t, []string{"HB.field.Alpha", "HB.field.Beta", "HB.field.Zulu"}, filtered[0][len(filtered[0])-3:])
	assert.NotContains(t, filtered[0], "HB.field.excluded-only")
	assert.Equal(t, full[0][:len(full[0])-4], filtered[0][:len(filtered[0])-3])
	allByRef := map[string][]string{}
	for _, row := range full[1:] {
		allByRef[row[allc["HB.import_ref"]]] = row
	}
	for _, row := range filtered[1:] {
		original := allByRef[row[fc["HB.import_ref"]]]
		require.NotNil(t, original)
		for name, col := range fc {
			assert.Equal(t, original[allc[name]], row[col], name)
		}
	}
	require.Contains(t, fc, "HB.parent_import_ref")
	assert.Equal(t, "box-ref", allByRef["first"][allc["HB.parent_import_ref"]])
	assert.Equal(t, "nested-ref", allByRef["second"][allc["HB.parent_import_ref"]])
	assert.Equal(t, "Garage / Shelf", allByRef["first"][allc["HB.location"]])

	// Use the same standard CSV writer as the download handler: escaping is unchanged.
	var buf bytes.Buffer
	writer := csv.NewWriter(&buf)
	require.NoError(t, writer.WriteAll(filtered))
	roundTrip, err := csv.NewReader(&buf).ReadAll()
	require.NoError(t, err)
	assert.Equal(t, filtered, roundTrip)

	empty, err := tSvc.Entities.ExportFilteredCSV(ctx, g.ID, "https://homebox.example", repo.EntityQuery{Search: "does-not-match"})
	require.NoError(t, err)
	require.Len(t, empty, 1)
	standard := []string{}
	for _, h := range full[0] {
		if !strings.HasPrefix(h, "HB.field.") {
			standard = append(standard, h)
		}
	}
	assert.Equal(t, standard, empty[0])
	buf.Reset()
	require.NoError(t, csv.NewWriter(&buf).WriteAll(empty))
	roundTrip, err = csv.NewReader(&buf).ReadAll()
	require.NoError(t, err)
	assert.Equal(t, empty, roundTrip)
}
