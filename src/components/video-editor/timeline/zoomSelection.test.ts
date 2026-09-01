import { describe, expect, it } from "vitest";
import { getNextZoomSelection } from "./zoomSelection";

const orderedIds = ["a", "b", "c", "d"];

describe("getNextZoomSelection", () => {
	it("replaces the selection on a regular click", () => {
		expect(getNextZoomSelection({ orderedIds, selectedIds: ["a", "b"], clickedId: "c" })).toEqual([
			"c",
		]);
	});

	it("toggles individual items with the platform modifier", () => {
		expect(
			getNextZoomSelection({
				orderedIds,
				selectedIds: ["a"],
				clickedId: "c",
				toggle: true,
			}),
		).toEqual(["a", "c"]);
		expect(
			getNextZoomSelection({
				orderedIds,
				selectedIds: ["a", "c"],
				clickedId: "a",
				toggle: true,
			}),
		).toEqual(["c"]);
	});

	it("selects an ordered range while keeping the clicked item primary", () => {
		expect(
			getNextZoomSelection({
				orderedIds,
				selectedIds: ["d"],
				clickedId: "a",
				anchorId: "c",
				range: true,
			}),
		).toEqual(["b", "c", "a"]);
	});
});
