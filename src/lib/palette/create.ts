import { browser } from '$app/environment';
import { use_clickoutside, use_portal } from '$lib/internal/actions.js';
import type { Cleanup, OneOrMany, WritableExposed } from '$lib/internal/helpers/index.js';
import { Searcher, addKeyBinding, builder, exposeWritable, hyperId, writableExposed } from '$lib/internal/helpers/index.js';
import { tick } from 'svelte';
import { ACTIONABLE_CLOSE_ON, HYPER_ITEM, NAVIGABLE_CLOSE_ON, NO_RESULTS_MODE, PALETTE_CLOSE_ACTION, PALETTE_ELEMENTS_IDS, SORT_MODE } from './constants.js';
import { HyperPaletteError } from './errors.js';
import type { AnyHyperItem, AnyHyperModeOptions, CreatePaletteOptions, CreatePaletteReturn, HyperActionable, HyperItemType, HyperNavigable, HyperNavigableConfig, HyperSearchable, ItemMatcher, ItemRequestSource, PaletteError, PaletteIds, PaletteModeSort, PaletteModeState, PaletteModesOptions, PaletteOptions, PaletteSelected } from './types.js';

const INTERNAL_KEY = {
    OPEN_PALETTE: '__hyper_open_palette',
    CLOSE_PALETTE: '__hyper_close_palette',
    DATASET_HYPER_ID: 'dataHyperId',
} as const;

const SR_STYLE = `
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  border: none;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
`;

const defaults = {
    closeAction: PALETTE_CLOSE_ACTION.RESET,
    closeOnClickOutside: true,
    closeOnEscape: true,
    debounce: 150,
    defaults: {
        open: false,
        search: '',
        placeholder: undefined,
    },
    portal: false,
    resetOnOpen: false,
} satisfies (
        Omit<PaletteOptions, 'defaults' | 'modes' | 'open' | 'placeholder'>
        & { defaults: Pick<PaletteOptions['defaults'], 'open' | 'placeholder' | 'search'>; }
    );

function elementName(name?: string): string {
    return name ? `palette-${name}` : 'palette';
}

function getIds(initials: Partial<PaletteIds>): PaletteIds {
    const ids = {} as PaletteIds;
    for (const name of PALETTE_ELEMENTS_IDS) {
        ids[name] = initials[name] || hyperId();
    }
    return ids;
}

function getInitialMode(modes: Map<string, PaletteModeState>, search: string, initial?: string): PaletteModeState {
    let mode: PaletteModeState | undefined;
    if (search) {
        for (const config of modes.values()) {
            if (search.startsWith(config.config.prefix)) {
                mode = config;
                break;
            }
        }
    }
    else if (initial) {
        mode = modes.get(initial);
        if (!mode) {
            throw new HyperPaletteError(
                `Invalid initial mode: '${initial}', expected one of '${Array.from(modes.keys())}'`
            );
        }
    }
    if (!mode) {
        mode = modes.values().next().value;
    }
    if (!mode) {
        throw new HyperPaletteError(
            `Initial mode couldn't be resolved from default search '${search}' and default mode '${initial}'`
        );
    }

    return mode;
}

function defaultItemSorter(items: AnyHyperItem[]) {
    items.sort((a, b) => a.hcache.sort.localeCompare(b.hcache.sort));
}

function getModes<T extends PaletteModesOptions>(items: T): Map<string, PaletteModeState> {
    if (typeof items !== 'object' || items === null) {
        throw new HyperPaletteError(
            `Invalid modes configuration, expected Record<string, PaletteModeOptions> got '${items}'`
        );
    }

    const modes = new Map<string, PaletteModeState>();
    const prefixes = new Set<string>();
    for (const [mode, options] of Object.entries(items)) {
        if (typeof options !== 'object' || options === null) {
            throw new HyperPaletteError(
                `Invalid mode configuration, expected PaletteModeOptions got '${options}' at mode '${mode}'`
            );
        }
        if (modes.has(mode)) {
            throw new HyperPaletteError(`Duplicate mode: '${mode}'`);
        }
        if (prefixes.has(options.prefix)) {
            throw new HyperPaletteError(`Duplicate prefix: '${options.prefix}'`);
        }

        let mode_config: AnyHyperModeOptions;
        if (options.type === HYPER_ITEM.ACTIONABLE) {
            mode_config = {
                type: HYPER_ITEM.ACTIONABLE,
                prefix: options.prefix,
                mapToSearch: options.mapToSearch,
                closeOn: options.closeOn ?? ACTIONABLE_CLOSE_ON.ALWAYS,
                emptyMode: options.emptyMode ?? NO_RESULTS_MODE.ALL,
                shortcut: options.shortcut ?? [],
                sortBy: options.sortBy,
                sortMode: options.sortMode ?? SORT_MODE.SORTED,
            };
        }
        else if (options.type === HYPER_ITEM.NAVIGABLE) {
            mode_config = {
                type: HYPER_ITEM.NAVIGABLE,
                prefix: options.prefix,
                mapToSearch: options.mapToSearch,
                closeOn: options.closeOn ?? NAVIGABLE_CLOSE_ON.ALWAYS,
                emptyMode: options.emptyMode ?? NO_RESULTS_MODE.ALL,
                onExternal: options.onExternal ?? ((url: string) => { window.open(url, '_blank'); }),
                onLocal: options.onLocal ?? ((url: string) => { window.location.href = url; }),
                onNavigation: options.onNavigation,
                onError: options.onError,
                shortcut: options.shortcut ?? [],
                sortBy: options.sortBy,
                sortMode: options.sortMode ?? SORT_MODE.SORTED,
            };
        }
        else if (options.type === HYPER_ITEM.SEARCHABLE) {
            mode_config = {
                type: HYPER_ITEM.SEARCHABLE,
                mapToSearch: options.mapToSearch,
                prefix: options.prefix,
                emptyMode: options.emptyMode ?? NO_RESULTS_MODE.ALL,
                shortcut: options.shortcut ?? [],
                sortBy: options.sortBy,
                sortMode: options.sortMode ?? SORT_MODE.SORTED,
            };
        }
        else {
            // @ts-expect-error - Run time validation
            throw new HyperPaletteError(`Invalid item type: '${options.type}'`);
        }

        let modeSort: PaletteModeSort;
        if (!mode_config.sortBy) {
            modeSort = {
                type: 'search',
                mapper: mode_config.mapToSearch,
                sorter: defaultItemSorter
            };
        }
        else if (typeof mode_config.sortBy === 'function') {
            modeSort = {
                type: 'custom',
                sorter: mode_config.sortBy,
            };
        }
        else {
            if (!Array.isArray(mode_config.sortBy) || mode_config.sortBy.length === 0) {
                throw new HyperPaletteError(`Invalid sortBy: '${mode_config.sortBy}'`);
            }

            const keys = mode_config.sortBy;
            const mapper = (item: AnyHyperItem) => {
                let result = '';
                for (const key of keys) {
                    if (key in item) {
                        // @ts-expect-error - Run time validated
                        const value = item[key];
                        if (typeof value === 'string') {
                            result += value.trim();
                        }
                    }
                }
                return result;
            };
            modeSort = {
                type: 'keys',
                mapper: mapper,
                sorter: defaultItemSorter
            };
        }

        const state = {
            mode: mode,
            sort: modeSort,
            config: mode_config,
            items: writableExposed([]),
            results: writableExposed([]),
            history: writableExposed([]),
            searcher: new Searcher({ mapper: options.mapToSearch as any }),
            current: writableExposed(undefined),
            rawAll: [],
            rawAllSorted: [],
            lastInput: '',
        } as PaletteModeState;

        modes.set(mode, state);
        prefixes.add(options.prefix);
    }

    return modes;
}

export function createPalette<T extends CreatePaletteOptions, M extends T['modes']>(options: T) {
    const safeOptions = { ...defaults, ...options } as PaletteOptions;
    safeOptions.defaults = { ...defaults.defaults, ...safeOptions.defaults };

    const _internal_cleanup = new Map<string, Cleanup>();

    const _modes = getModes(safeOptions.modes);

    let _input_el: HTMLInputElement | undefined;
    let _mode_state: PaletteModeState = getInitialMode(
        _modes,
        safeOptions.defaults.search,
        safeOptions.defaults.mode
    );
    let _open: WritableExposed<boolean>;
    if (options.open) {
        const open = exposeWritable(options.open);
        if (!browser) {
            open.unsubscribe();
        }
        else {
            _internal_cleanup.set('open', open.unsubscribe);
        }
        _open = open;
    }
    else {
        _open = writableExposed(safeOptions.defaults.open);
    }

    const ids = getIds(safeOptions.defaults.ids ?? {});
    const searchText = writableExposed(safeOptions.defaults.search);
    const paletteMode = writableExposed(_mode_state.mode);
    const closeAction = writableExposed(safeOptions.closeAction);
    const closeOnClickOutside = writableExposed(safeOptions.closeOnClickOutside);
    const closeOnEscape = writableExposed(safeOptions.closeOnEscape);
    const debounce = writableExposed(safeOptions.debounce);
    const error = writableExposed<PaletteError<M> | undefined>(undefined);
    const placeholder = writableExposed(safeOptions.defaults.placeholder);
    const portal = writableExposed(safeOptions.portal);
    const resetOnOpen = writableExposed(safeOptions.resetOnOpen);
    const selected = writableExposed<PaletteSelected>({
        el: undefined,
        idx: -1,
        id: undefined,
    });

    function _set_empty_results() {
        _mode_state.results.set([]);
        selected.value.el = undefined;
        selected.value.id = undefined;
        selected.value.idx = -1;
        selected.sync();
    }

    function _search_and_update(pattern: string) {
        let results: AnyHyperItem[];
        if (pattern === '') {
            switch (_mode_state.config.emptyMode) {
                case NO_RESULTS_MODE.ALL:
                    results = [..._mode_state.rawAllSorted];
                    break;
                case NO_RESULTS_MODE.HISTORY:
                    results = [];
                    for (const id of _mode_state.history.value) {
                        for (const item of _mode_state.rawAll) {
                            if (item.id === id) {
                                results.push(item);
                                break;
                            }
                        }
                    }
                    break;
                case NO_RESULTS_MODE.NONE:
                    results = [];
                    break;
                default:
                    throw new HyperPaletteError(`Invalid empty mode: ${_mode_state.config.emptyMode}`);
            }
        }
        else {
            results = _mode_state.searcher.search(pattern);
            _mode_state.sort.sorter(results);
        }

        _mode_state.results.set(results);

        if (results.length === 0) {
            selected.value.id = undefined;
            selected.value.idx = -1;
            selected.sync();
        }
        else {
            selected.value.id = results[0].id;
            selected.value.idx = 0;
            selected.sync();
        }
    }

    function _update_results() {
        let query = searchText.value;
        // POSSIBLE BUG: assumes prefix is always at the start of the query
        query = query.slice(_mode_state.config.prefix.length);
        _search_and_update(query);
    }

    function _open_palette(mode: string) {
        _mode_state = _modes.get(mode) as PaletteModeState<HyperItemType>;

        tick().then(() => {
            if (!_open.value || !_input_el) {
                return;
            }
            if (resetOnOpen.value) {
                _input_el.value = _mode_state.config.prefix;
            }
            else {
                _input_el.value = _mode_state.config.prefix + searchText.value;
            }
            _input_el.focus();
        });

        paletteMode.set(mode);
        _open.set(true);

        if (!resetOnOpen.value) {
            return;
        }

        _mode_state.current.set(undefined);
        searchText.set(_mode_state.config.prefix);
        _update_results();
    }

    function _close_palette() {
        if (!_open.value) {
            return;
        }

        _open.set(false);
        _resolve_close_action();
    }

    /**
     * Resolves the close action based on the current mode configuration
     * 
     * It doesn't reset the current item since it's handled by the specific item
     * resolve function
     */
    function _resolve_close_action() {
        const should_reset = closeAction.value === PALETTE_CLOSE_ACTION.RESET || closeAction.value === PALETTE_CLOSE_ACTION.RESET_CLOSE;
        const should_close = closeAction.value === PALETTE_CLOSE_ACTION.KEEP_CLOSE || closeAction.value === PALETTE_CLOSE_ACTION.RESET_CLOSE;

        _mode_state.lastInput = searchText.value;

        if (should_reset) {
            const input_text = _mode_state.config.prefix;
            if (_input_el) {
                _input_el.value = input_text;
            }
            searchText.set(input_text);
            _search_and_update('');
        }

        if (should_close && !_open.value) {
            _open.set(true);
        }
    }

    async function _resolve_actionable(item: HyperActionable, source: ItemRequestSource) {
        _mode_state.current.set(item);

        if (item.closeOn === ACTIONABLE_CLOSE_ON.ON_TRIGGER) {
            _resolve_close_action();
        }

        const preAction = await item.onRequest({ item, source });
        if (preAction === false) {
            if (
                item.closeOn === ACTIONABLE_CLOSE_ON.ON_CANCEL
                || item.closeOn === ACTIONABLE_CLOSE_ON.ALWAYS
            ) {
                _resolve_close_action();
                _mode_state.current.set(undefined);
            }
            return;
        }

        try {
            await item.onAction({ item, source, rarg: preAction });
            error.set(undefined);
        }
        catch (e) {
            // @ts-expect-error - Its safe to set the error
            error.set({
                error: e,
                item: item,
                source: source,
                mode: _mode_state.mode,
            });
            if (item.onError) {
                item.onError({ error: e, item: item, source: source });
            }
            if (
                item.closeOn === ACTIONABLE_CLOSE_ON.ON_ERROR
                || item.closeOn === ACTIONABLE_CLOSE_ON.ALWAYS
            ) {
                _resolve_close_action();
                _mode_state.current.set(undefined);
                return;
            }
        }
        finally {
            _mode_state.history.value.unshift(item.id);
            _mode_state.history.sync();
        }

        if (
            item.closeOn === ACTIONABLE_CLOSE_ON.ON_SUCCESS
            || item.closeOn === ACTIONABLE_CLOSE_ON.ALWAYS
        ) {
            _resolve_close_action();
        }

        _mode_state.current.set(undefined);
    }

    async function _resolve_navigable(item: HyperNavigable, source: ItemRequestSource) {
        _mode_state.current.set(item);

        const config = _mode_state.config as HyperNavigableConfig;
        if (item.closeOn === NAVIGABLE_CLOSE_ON.ON_TRIGGER) {
            _resolve_close_action();
        }

        try {
            if (config.onNavigation) {
                await config.onNavigation(item);
            }
            else if (item.external) {
                await config.onExternal(item.url);
            }
            else {
                await config.onLocal(item.url);
            }
            error.set(undefined);
        }
        catch (e) {
            // @ts-expect-error - Its safe to set the error
            error.set({
                error: e,
                item: item,
                source: source,
                mode: _mode_state.mode,
            });
            if (config.onError) {
                config.onError({ error: e, item: item, source: source });
            }
            if (
                item.closeOn === NAVIGABLE_CLOSE_ON.ON_ERROR
                || item.closeOn === NAVIGABLE_CLOSE_ON.ALWAYS
            ) {
                _resolve_close_action();

                _mode_state.current.set(undefined);
                return;
            }
        }
        finally {
            _mode_state.history.value.unshift(item.id);
            _mode_state.history.sync();
        }

        if (
            item.closeOn === NAVIGABLE_CLOSE_ON.ON_SUCCESS
            || item.closeOn === NAVIGABLE_CLOSE_ON.ALWAYS
        ) {
            _resolve_close_action();
            _mode_state.current.set(undefined);
        }
    }

    async function _resolve_searchable(item: HyperSearchable, source: ItemRequestSource) {
        throw new HyperPaletteError(
            `Unimplemented searchable item: ${item} source: ${source}`
        );
    }

    const _shorcuts_cleanup = new Map<string, Cleanup[]>();
    _internal_cleanup.set('shortcuts', () => {
        for (const cleanups of _shorcuts_cleanup.values()) {
            for (const c of cleanups) {
                c();
            }
        }
    });

    function _register_shortcut(item: HyperActionable) {
        const shortcuts = item.shortcut;
        if (shortcuts.length === 0) {
            return;
        }

        const cleanup: Cleanup[] = [];
        for (const s of shortcuts) {
            const c = addKeyBinding(window, s, (event) => {
                event.preventDefault();
                _resolve_actionable(
                    item,
                    { type: 'shortcut', event: event, shortcut: s }
                );
            });
            if (c) {
                cleanup.push(c);
            }
        }

        _shorcuts_cleanup.set(item.id, cleanup);
    }

    function _unregister_shortcut(item: HyperActionable) {
        const cleanup = _shorcuts_cleanup.get(item.id);
        if (cleanup) {
            for (const c of cleanup) {
                c();
            }
            _shorcuts_cleanup.delete(item.id);
        }
    }

    function _register_palette_shortcuts() {
        const cleanup: Cleanup[] = [];
        for (const mode of _modes.values()) {
            if (!mode.config.shortcut) {
                continue;
            }
            for (const s of mode.config.shortcut) {
                const c = addKeyBinding(window, s, (event) => {
                    event.preventDefault();
                    _open_palette(mode.mode);
                });
                if (c) {
                    cleanup.push(c);
                }
            }
        }
        _shorcuts_cleanup.set(INTERNAL_KEY.OPEN_PALETTE, cleanup);
    }

    function _register_escape_shortcut() {
        const cleanup = addKeyBinding(window, 'Escape', (event) => {
            event.preventDefault();
            _close_palette();
        }, { once: true });
        if (cleanup) {
            _internal_cleanup.set(INTERNAL_KEY.CLOSE_PALETTE, cleanup);
        }
    }

    function _unregister_escape_shortcut() {
        const cleanup = _internal_cleanup.get(INTERNAL_KEY.CLOSE_PALETTE);
        if (cleanup) {
            cleanup();
            _internal_cleanup.delete(INTERNAL_KEY.CLOSE_PALETTE);
        }
    }

    function _unregister_palette_shortcuts() {
        for (const key of [INTERNAL_KEY.OPEN_PALETTE, INTERNAL_KEY.CLOSE_PALETTE]) {
            const cleanup = _shorcuts_cleanup.get(key);
            if (cleanup) {
                for (const c of cleanup) {
                    c();
                }
                _shorcuts_cleanup.delete(key);
            }
        }
    }

    function _select_next_result() {
        const results = _mode_state.results.value;
        if (!results.length) {
            return;
        }

        const selectedIdx = selected.value.idx;
        if (selectedIdx === -1) {
            selected.value.idx = 0;
            selected.value.id = results[0].id;
        }
        else {
            const newIdx = (selectedIdx + 1) % results.length;
            selected.value.idx = newIdx;
            selected.value.id = results[newIdx].id;
        }

        selected.sync();
    }

    function _select_previous_result() {
        const results = _mode_state.results.value;
        if (!results.length) {
            return;
        }

        const selectedIdx = selected.value.idx;
        if (selectedIdx === -1) {
            selected.value.idx = results.length - 1;
            selected.value.id = results[results.length - 1].id;
        }
        else {
            const newIdx = (selectedIdx - 1 + results.length) % results.length;
            selected.value.idx = newIdx;
            selected.value.id = results[newIdx].id;
        }

        selected.sync();
    }

    function _register_item<T extends string>(mode: T, item: OneOrMany<AnyHyperItem>, override: boolean = false, silent: boolean = true) {
        const _mode = _modes.get(mode) as PaletteModeState;
        const unsafe_items: AnyHyperItem[] = Array.isArray(item) ? item : [item];
        const new_items: AnyHyperItem[] = [];
        const removed_items: AnyHyperItem[] = [];

        for (const unsafe_item of unsafe_items) {
            const new_item = unsafe_item;
            let found_idx = -1;
            for (let i = 0; i < _mode.rawAll.length; i++) {
                if (_mode.rawAll[i].id === new_item.id) {
                    found_idx = i;
                    break;
                }
            }

            new_item.hcache.sort = (_mode.sort.type === 'custom' ? '' : _mode.sort.mapper(new_item)).toLowerCase();

            if (found_idx === -1) {
                new_items.push(new_item);
                _mode.rawAll.push(new_item);
                _mode.items.value.push(new_item);
                _mode.searcher.add(new_item);
                if ('shortcut' in new_item) {
                    _register_shortcut(new_item);
                }
                continue;
            }

            if (override) {
                const removed = _mode.rawAll[found_idx];
                if ('shortcut' in removed) {
                    _unregister_shortcut(removed);
                }
                if ('onUnregister' in removed) {
                    removed.onUnregister?.(removed);
                }
                // @ts-expect-error - Its safe to remove the item
                _mode.searcher.remove(removed);
                removed_items.push(removed);

                _mode.rawAll[found_idx] = new_item;
                if ('shortcut' in new_item) {
                    _register_shortcut(new_item);
                }
                _mode.items.value[found_idx] = new_item;
                _mode.searcher.add(new_item);
                continue;
            }

            if (silent) {
                continue;
            }

            throw new HyperPaletteError(`Item with id ${new_item.id} already exists in the palette, current ${_mode.rawAll[found_idx]} new ${new_item}`);
        }

        _mode.rawAllSorted = [..._mode.rawAll];

        if (_mode.config.sortMode !== SORT_MODE.UNSORTED) {
            _mode.sort.sorter(_mode.rawAllSorted);
            if (_mode.config.sortMode === SORT_MODE.REVERSED) {
                _mode.rawAllSorted.reverse();
            }
        }

        _mode.items.sync();

        if (_open.value && _mode_state.mode === mode) {
            _update_results();
        }

        return () => {
            const _mode = _modes.get(mode);
            if (!_mode) {
                return;
            }

            for (const new_item of new_items) {
                let idx = -1;
                for (let i = 0; i < _mode.rawAll.length; i++) {
                    if (_mode.rawAll[i].id === new_item.id) {
                        idx = i;
                        break;
                    }
                }
                if (idx === -1) {
                    continue;
                }

                _mode.rawAll.splice(idx, 1);
                _mode.items.value.splice(idx, 1);
                // @ts-expect-error - Its safe to remove the item
                _mode.searcher.remove(new_item);
                if ('shortcut' in new_item) {
                    _unregister_shortcut(new_item);
                }
                if ('onUnregister' in new_item) {
                    new_item.onUnregister?.(new_item);
                }
                for (let i = 0; i < _mode.rawAllSorted.length; i++) {
                    if (_mode.rawAllSorted[i].id === new_item.id) {
                        _mode.rawAllSorted.splice(i, 1);
                        break;
                    }
                }
            }

            _mode.items.sync();
            if (_open.value && _mode_state.mode === mode) {
                _update_results();
            }
        };
    }

    function _unregister_item<T extends string>(mode: T, selector: OneOrMany<ItemMatcher<AnyHyperItem>>) {
        const _mode = _modes.get(mode) as PaletteModeState;
        const selectors = Array.isArray(selector) ? selector : [selector];

        let removed_count = 0;
        const to_remove: number[] = [];
        for (const selector of selectors) {
            to_remove.length = 0;
            if (typeof selector === 'string') {
                for (let i = 0; i < _mode.rawAll.length; i++) {
                    if (_mode.rawAll[i].id === selector) {
                        to_remove.push(i);
                        break;
                    }
                }
            }
            else if (typeof selector === 'function') {
                for (let i = 0; i < _mode.rawAll.length; i++) {
                    if (selector(_mode.rawAll[i])) {
                        to_remove.push(i);
                    }
                }
            }
            else {
                for (let i = 0; i < _mode.rawAll.length; i++) {
                    if (selector === _mode.rawAll[i]) {
                        to_remove.push(i);
                        break;
                    }
                }
            }

            if (!to_remove.length) {
                continue;
            }

            removed_count += to_remove.length;

            for (let i = to_remove.length - 1; i >= 0; i--) {
                const idx = to_remove[i];
                const removed = _mode.rawAll[idx];
                _mode.rawAll.splice(idx, 1);
                _mode.items.value.splice(idx, 1);
                // @ts-expect-error - Its safe to remove the item
                _mode.searcher.remove(removed);
                if ('shortcut' in removed) {
                    _unregister_shortcut(removed);
                }
                if ('onUnregister' in removed) {
                    removed.onUnregister?.(removed);
                }
                for (let i = 0; i < _mode.rawAllSorted.length; i++) {
                    if (_mode.rawAllSorted[i].id === removed.id) {
                        _mode.rawAllSorted.splice(i, 1);
                        break;
                    }
                }
            }
        }

        if (removed_count === 0) {
            return;
        }

        _mode.items.sync();
        if (_open.value && _mode_state.mode === mode) {
            _update_results();
        }
    }

    //
    // Elements
    //

    const builderPalette = builder(elementName(), {
        stores: [portal],
        returned: ([$portal]) => {
            return {
                'data-portal': $portal ? '' : undefined,
                id: ids.palette,
            };
        },
        action: (node) => {
            const cleanup: Cleanup[] = [];

            if (safeOptions.portal) {
                const _portal = use_portal(node, safeOptions.portal);
                const _unsubscribe = portal.subscribe((value) => {
                    _portal.update(value);
                });
                cleanup.push(() => {
                    _portal.destroy();
                    _unsubscribe();
                });
            }

            _register_palette_shortcuts();
            cleanup.push(_unregister_palette_shortcuts);

            for (const mode of _modes.values()) {
                for (const shorcut of mode.config.shortcut ?? []) {
                    const c = addKeyBinding(window, shorcut, (event) => {
                        event.preventDefault();
                        _open_palette(mode.mode);
                    });
                    if (c) {
                        cleanup.push(c);
                    }
                }
            }

            return {
                destroy() {
                    for (const c of cleanup) {
                        c();
                    }
                    for (const c of _internal_cleanup.values()) {
                        c();
                    }
                }
            };
        }
    });

    const builderPanel = builder(elementName('panel'), {
        returned: () => {
            return {
                id: ids.panel,
            };
        },
        action: (node) => {
            const cleanup: Cleanup[] = [];

            if (safeOptions.closeOnClickOutside) {
                cleanup.push(
                    use_clickoutside(node, {
                        "type": "pointerdown",
                        handler: _close_palette
                    }).destroy
                );
            }

            if (safeOptions.closeOnEscape) {
                _register_escape_shortcut();
                cleanup.push(_unregister_escape_shortcut);
            }

            return {
                destroy() {
                    for (const c of cleanup) {
                        c();
                    }
                }
            };
        }
    });

    const builderForm = builder(elementName('search-form'), {
        returned: () => {
            return {
                id: ids.form,
            };
        },
        action: (node) => {
            function on_submit(event: SubmitEvent) {
                event.preventDefault();
                if (_mode_state.results.value.length === 0) {
                    return;
                }

                let selectedIdx = selected.value.idx;
                let item: AnyHyperItem;
                if (selectedIdx < 0) {
                    selectedIdx = 0;
                    item = _mode_state.results.value[selectedIdx];
                    selected.value.id = item.id;
                    selected.value.idx = selectedIdx;
                    selected.sync();
                }
                else {
                    item = _mode_state.results.value[selectedIdx];
                }

                if (!item) {
                    // NEVER: selected index should always be valid
                    throw new HyperPaletteError(
                        `Invalid selected index: ${selectedIdx} for ${_mode_state}`
                    );
                }

                const source: ItemRequestSource = { type: 'submit', event: event };

                if (item.type === HYPER_ITEM.ACTIONABLE) {
                    _resolve_actionable(item as HyperActionable, source);
                }
                else if (item.type === HYPER_ITEM.NAVIGABLE) {
                    _resolve_navigable(item as HyperNavigable, source);
                }
                else {
                    _resolve_searchable(item as HyperSearchable, source);
                }
            }

            node.addEventListener('submit', on_submit);

            return {
                destroy() {
                    node.removeEventListener('submit', on_submit);
                }
            };
        }
    });

    const builderLabel = builder(elementName('search-label'), {
        returned: () => {
            return {
                id: ids.label,
                for: ids.input,
                style: SR_STYLE,
            };
        },
    });

    const builderInput = builder(elementName('search-input'), {
        stores: [placeholder],
        returned: ([$placeholder]) => {
            return {
                id: ids.input,
                type: 'text',
                autocomplete: 'off',
                spellcheck: false,
                placeholder: $placeholder || undefined,
                'aria-labelledby': ids.label,
            };
        },
        action: (node) => {
            _input_el = node as unknown as HTMLInputElement;

            let debounce_id: number | undefined;

            function on_input(event: Event) {
                const el = event.target as HTMLInputElement;
                const raw_value = el.value;
                searchText.set(raw_value);
                let query = raw_value;
                let newInputMode = paletteMode.value;
                let force_search = debounce.value <= 0;
                if (!query.startsWith(_mode_state.config.prefix) || !_mode_state.config.prefix) {
                    for (const mode of _modes.values()) {
                        if (query.startsWith(mode.config.prefix)) {
                            newInputMode = mode.mode;
                            break;
                        }
                    }
                }

                if (newInputMode !== paletteMode.value) {
                    force_search = true;
                    const mode = _modes.get(newInputMode);
                    if (!mode) {
                        _set_empty_results();
                        return;
                    }
                    _mode_state = mode;
                    paletteMode.set(newInputMode);
                }

                clearTimeout(debounce_id);
                query = query.slice(_mode_state.config.prefix.length);

                if (force_search) {
                    console.log(`searching: ${query}`);
                    _search_and_update(query);
                    return;
                }

                debounce_id = setTimeout(
                    _search_and_update,
                    debounce.value,
                    query
                );
            }

            function on_keydown(event: KeyboardEvent) {
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    _select_next_result();
                }
                else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    _select_previous_result();
                }
                else if (event.key === 'Escape') {
                    // noop?
                }
                else if (event.key === 'Tab') {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                }
            }

            node.addEventListener('input', on_input);
            node.addEventListener('keydown', on_keydown);

            return {
                destroy() {
                    _input_el = undefined;
                    node.removeEventListener('input', on_input);
                    node.removeEventListener('keydown', on_keydown);
                }
            };
        }
    });

    const builderItem = builder(elementName('item'), {
        stores: [],
        returned: () => {
            return {
                role: 'button',
            };
        },
        action: (node: HTMLElement, item: AnyHyperItem) => {
            function on_click(event: MouseEvent) {
                event.preventDefault();
                const el = event.currentTarget as HTMLElement;
                const source: ItemRequestSource = { type: 'click', event: event };
                const id = el.getAttribute('data-hyper-id');
                let idx = -1;
                for (let i = 0; i < _mode_state.results.value.length; i++) {
                    if (_mode_state.results.value[i].id === id) {
                        idx = i;
                        break;
                    }
                }
                if (idx === -1) {
                    throw new HyperPaletteError(`Invalid item id: ${id}`);
                }

                const item = _mode_state.results.value[idx];
                if (!item) {
                    throw new HyperPaletteError(`Invalid item: ${item} mode: ${_mode_state}`);
                }

                if (item.type === HYPER_ITEM.ACTIONABLE) {
                    _resolve_actionable(item as HyperActionable, source);
                }
                else if (item.type === HYPER_ITEM.NAVIGABLE) {
                    _resolve_navigable(item as HyperNavigable, source);
                }
                else {
                    _resolve_searchable(item as HyperSearchable, source);
                }

            }

            node.dataset[INTERNAL_KEY.DATASET_HYPER_ID] = item.id.toString();

            node.addEventListener('click', on_click);

            const unsubscribe_selected = selected.subscribe((value) => {
                if (value.id !== item.id) {
                    delete node.dataset['selected'];
                    return;
                }

                node.dataset['selected'] = '';
                node.scrollIntoView({ behavior: 'instant', 'block': 'nearest' });
            });

            return {
                destroy() {
                    node.removeEventListener('click', on_click);
                    unsubscribe_selected();
                }
            };
        }
    });

    function _exposed_state(): CreatePaletteReturn<M>['states'] {
        const modes: Record<string, any> = {};
        for (const [type, mode] of _modes) {
            modes[mode.mode] = {
                items: mode.items,
                results: mode.results,
                current: mode.current,
                history: mode.history,
            };
        }
        return {
            open: _open,
            searchInput: searchText,
            mode: paletteMode,
            error,
            portal,
            placeholder,
            modes: modes as any
        };
    }

    return {
        elements: {
            palette: builderPalette,
            panel: builderPanel,
            form: builderForm,
            label: builderLabel,
            input: builderInput,
            item: builderItem,
        },
        helpers: {
            registerItem: (type, item, override = false, silent = true) => {
                if (!_modes.has(type)) {
                    throw new HyperPaletteError(`Custom mode ${type} was not registered`);
                }

                return _register_item(type, item, override, silent);
            },
            unregisterItem: (mode, selector) => {
                if (!_modes.has(mode)) {
                    throw new HyperPaletteError(`Custom mode ${mode} was not registered`);
                }

                // @ts-expect-error - Its a valid selector
                return _unregister_item(mode, selector);
            },
            search: (pattern) => {
                pattern = pattern.trim();
                _search_and_update(pattern);
            },
            openPalette: (mode) => {
                _open_palette(mode ?? _mode_state.mode);
            },
            closePalette: _close_palette,
            togglePalette: () => {
                if (_open.value) {
                    _close_palette();
                }
                else {
                    _open_palette(_mode_state.mode);
                }
            },
            registerPaletteShortcuts: _register_palette_shortcuts,
            unregisterPaletteShortcuts: _unregister_palette_shortcuts,
        },
        states: _exposed_state()
    } satisfies CreatePaletteReturn<M>;
}
