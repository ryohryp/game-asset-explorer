import * as assert from "node:assert/strict";
import { test } from "node:test";
import { buildAssetHealthDashboardCounts } from "../src/core/assetHealthDashboard";

test("buildAssetHealthDashboardCounts aggregates dashboard signals", () => {
  assert.deepEqual(buildAssetHealthDashboardCounts({
    totalAssets: 12, gitModified: 3, potentiallyUnused: 4,
    duplicateGroups: [{ assets: [{}, {}] }, { assets: [{}, {}, {}] }], problems: 2,
  }), {
    totalAssets: 12, gitModified: 3, potentiallyUnused: 4, duplicateAssets: 5, problems: 2,
  });
});

test("buildAssetHealthDashboardCounts keeps empty signals at zero", () => {
  const result = buildAssetHealthDashboardCounts({ totalAssets: 0, gitModified: 0, potentiallyUnused: 0, duplicateGroups: [], problems: 0 });
  assert.deepEqual(result, { totalAssets: 0, gitModified: 0, potentiallyUnused: 0, duplicateAssets: 0, problems: 0 });
});
