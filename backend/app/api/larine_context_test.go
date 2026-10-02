package main

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"testing/fstest"
)

func TestLarineContextIndependentEnvironment(t *testing.T) {
	for _, tt := range []struct {
		name, workItem, statement string
	}{
		{"both", "canonical-work-item-projection", "statement"},
		{"work item only", "canonical-work-item-projection", ""},
		{"statement only", "", "statement"},
		{"neither", "", ""},
		{"whitespace unavailable", " \t", "\n"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("LARINE_ACTIVE_WORK_ITEM_ID", tt.workItem)
			t.Setenv("LARINE_STATEMENT_ID", tt.statement)
			// Neither legacy nor HomeBox-specific configuration can supply
			// an implicit fallback for the canonical generic variables.
			t.Setenv("LARINE_ENHANCEMENT_ID", "native-enhancement-must-not-be-used")
			t.Setenv("HBOX_LARINE_ACTIVE_WORK_ITEM_ID", "not-the-generic-variable")
			context := larineContextFromEnvironment()
			page := string(context.injectHTML([]byte("<!DOCTYPE html><html><head><script src='widget.js'></script></head><body></body></html>")))
			for _, value := range []struct{ name, id string }{
				{"__LARINE_ACTIVE_WORK_ITEM_ID__", tt.workItem},
				{"__LARINE_STATEMENT_ID__", tt.statement},
			} {
				prefix := "window." + value.name + "="
				if strings.TrimSpace(value.id) == "" {
					if strings.Contains(page, prefix) {
						t.Fatalf("unavailable association rendered: %s", page)
					}
					continue
				}
				encoded, _ := json.Marshal(value.id)
				assignment := prefix + string(encoded) + ";"
				if strings.Count(page, assignment) != 1 || strings.Index(page, assignment) > strings.Index(page, "src='widget.js'") {
					t.Fatalf("missing association or bootstrap ordered after widget: %s", page)
				}
			}
			for _, forbidden := range []string{"__LARINE_ENHANCEMENT_ID__", "native-enhancement", "not-the-generic-variable", "%LARINE_", "import.meta.env"} {
				if strings.Contains(page, forbidden) {
					t.Fatalf("unexpected fallback/placeholder: %s", page)
				}
			}
		})
	}
}

func TestLarineContextUnsetEnvironment(t *testing.T) {
	// Setenv registers cleanup to restore the caller's environment after
	// explicitly testing unset (not merely empty) values.
	for _, name := range []string{"LARINE_ACTIVE_WORK_ITEM_ID", "LARINE_STATEMENT_ID"} {
		t.Setenv(name, "")
		if err := os.Unsetenv(name); err != nil {
			t.Fatal(err)
		}
	}
	context := larineContextFromEnvironment()
	input := "<!DOCTYPE html><html><head></head><body></body></html>"
	if got := string(context.injectHTML([]byte(input))); got != input {
		t.Fatalf("no-context page changed: %s", got)
	}
}

func TestLarineContextScriptSafety(t *testing.T) {
	value := "</script><script>alert('injection')</script><img src=x onerror=alert(1)>\"\\&\n\r\t\u2028\u2029"
	context := larineContext{activeWorkItemID: value, statementID: value}
	page := string(context.injectHTML([]byte("<!DOCTYPE html><html><HEAD data-test='yes'><script src='widget.js'></script></HEAD></html>")))
	if strings.Count(page, "</script>") != 2 || strings.Contains(page, "<img") || strings.Contains(page, "<script>alert") {
		t.Fatalf("value escaped its script context: %s", page)
	}
	for _, name := range []string{"__LARINE_ACTIVE_WORK_ITEM_ID__", "__LARINE_STATEMENT_ID__"} {
		encoded := strings.SplitN(strings.SplitN(page, "window."+name+"=", 2)[1], ";", 2)[0]
		var decoded string
		if err := json.Unmarshal([]byte(encoded), &decoded); err != nil || decoded != value {
			t.Fatalf("association did not round-trip: %q, %v", decoded, err)
		}
	}
}

func TestStaticPageLarineContext(t *testing.T) {
	const html = "<!DOCTYPE html><html><head><script src='widget.js'></script></head><body>HomeBox</body></html>"
	files := fstest.MapFS{
		"static/public/index.html": {Data: []byte(html)},
		"static/public/login.html": {Data: []byte(html)},
		"static/public/app.js":     {Data: []byte("console.log('asset');")},
	}
	handler := staticPageHandler(files, larineContext{statementID: "statement-only"})
	for _, route := range []string{"/", "/index.html", "/login.html", "/items/123", "/app.js"} {
		t.Run(route, func(t *testing.T) {
			response := httptest.NewRecorder()
			if err := handler(response, httptest.NewRequest("GET", route, nil)); err != nil {
				t.Fatal(err)
			}
			if route == "/app.js" {
				if response.Body.String() != "console.log('asset');" {
					t.Fatal("non-HTML asset modified")
				}
				return
			}
			page := response.Body.String()
			if !strings.Contains(page, "window.__LARINE_STATEMENT_ID__=\"statement-only\";") || strings.Contains(page, "__LARINE_ACTIVE_WORK_ITEM_ID__") {
				t.Fatalf("incorrect independent associations: %s", page)
			}
			if response.Header().Get("Cache-Control") != "no-store" || !strings.HasPrefix(response.Header().Get("Content-Type"), "text/html") {
				t.Fatalf("incorrect HTML headers: %v", response.Header())
			}
		})
	}
}
