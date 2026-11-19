import assert from "node:assert/strict";
import test from "node:test";
import {
  badgeClassNames,
  buttonClassNames,
  sortRowsByKey,
  stackStyle,
} from "./preline-ui-utils.ts";

test("primary button uses the original blue action treatment", () => {
  const className = buttonClassNames({
    variant: "primary",
    size: "md",
  });

  assert.match(className, /bg-primary/);
  assert.match(className, /text-primary-foreground/);
  assert.match(className, /h-9/);
});

test("loading button communicates disabled interaction", () => {
  const className = buttonClassNames({
    isLoading: true,
    isDisabled: false,
  });

  assert.match(className, /cursor-not-allowed/);
  assert.match(className, /opacity-60/);
});

test("stack maps compatibility alignment props to CSS flex values", () => {
  assert.deepEqual(
    stackStyle({
      direction: "horizontal",
      gap: 2,
      align: "center",
      justify: "between",
    }),
    {
      display: "flex",
      flexDirection: "row",
      gap: "0.5rem",
      alignItems: "center",
      justifyContent: "space-between",
    },
  );
});

test("badge variants keep semantic color mapping", () => {
  assert.match(badgeClassNames("success"), /text-app-success/);
  assert.match(badgeClassNames("warning"), /text-app-ink/);
  assert.match(badgeClassNames("error"), /text-destructive/);
});

test("table sorting returns a new ordered array", () => {
  const rows = [{ name: "b" }, { name: "a" }];
  assert.deepEqual(sortRowsByKey(rows, "name", "asc"), [
    { name: "a" },
    { name: "b" },
  ]);
});
