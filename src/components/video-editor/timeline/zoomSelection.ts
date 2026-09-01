export interface ZoomSelectionOptions {
	orderedIds: string[];
	selectedIds: string[];
	clickedId: string;
	anchorId?: string | null;
	toggle?: boolean;
	range?: boolean;
}

export function getNextZoomSelection({
	orderedIds,
	selectedIds,
	clickedId,
	anchorId,
	toggle = false,
	range = false,
}: ZoomSelectionOptions): string[] {
	if (range && anchorId) {
		const anchorIndex = orderedIds.indexOf(anchorId);
		const clickedIndex = orderedIds.indexOf(clickedId);
		if (anchorIndex >= 0 && clickedIndex >= 0) {
			const start = Math.min(anchorIndex, clickedIndex);
			const end = Math.max(anchorIndex, clickedIndex);
			const rangeIds = orderedIds.slice(start, end + 1);
			const next = toggle ? [...new Set([...selectedIds, ...rangeIds])] : rangeIds;
			return [...next.filter((id) => id !== clickedId), clickedId];
		}
	}

	if (toggle) {
		return selectedIds.includes(clickedId)
			? selectedIds.filter((id) => id !== clickedId)
			: [...selectedIds, clickedId];
	}

	return [clickedId];
}
