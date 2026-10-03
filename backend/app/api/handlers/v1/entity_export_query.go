package v1

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
)

// resolveAssetSearch preserves list behavior: invalid asset IDs remain text searches.
func resolveAssetSearch(q *repo.EntityQuery) {
	if strings.HasPrefix(q.Search, "#") {
		if aid, ok := repo.ParseAssetID(strings.TrimPrefix(q.Search, "#")); ok {
			q.Search = ""
			q.AssetID = aid
		}
	}
}

// Filtered mode is explicit so old export calls retain the full collection behavior.
// Only basic filters are accepted here; page and advanced list options cannot limit rows.
func extractFilteredExportQuery(params url.Values) (repo.EntityQuery, bool, error) {
	var q repo.EntityQuery
	parseBool := func(key string) (bool, error) {
		values, supplied := params[key]
		if !supplied {
			return false, nil
		}
		if len(values) != 1 {
			return false, fmt.Errorf("%s must be a single boolean", key)
		}
		b, err := strconv.ParseBool(values[0])
		if err != nil {
			return false, fmt.Errorf("invalid %s boolean", key)
		}
		return b, nil
	}
	filtered, err := parseBool("filtered")
	if err != nil || !filtered {
		return q, false, err
	}
	q.Search = params.Get("q")
	q.IncludeArchived, err = parseBool("includeArchived")
	if err != nil {
		return q, true, err
	}
	parseIDs := func(key string) ([]uuid.UUID, error) {
		ids := make([]uuid.UUID, 0, len(params[key]))
		for _, value := range params[key] {
			id, err := uuid.Parse(value)
			if err != nil || id == uuid.Nil {
				return nil, fmt.Errorf("invalid %s UUID", key)
			}
			ids = append(ids, id)
		}
		return ids, nil
	}
	q.ParentIDs, err = parseIDs("parentIds")
	if err != nil {
		return q, true, err
	}
	q.TagIDs, err = parseIDs("tags")
	if err != nil {
		return q, true, err
	}
	resolveAssetSearch(&q)
	return q, true, nil
}
