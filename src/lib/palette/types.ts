import type { Register } from '$lib/index.js';
import type { Cleanup, DeepPartial, HyperId, MaybePromise, OneOrMany, Searcher, Tuple, Values, WritableExposed } from '$lib/internal/helpers/index.js';
import type { Writable } from 'svelte/store';
import type * as C from './constants.js';

//
// Constants
//

export type PaletteMode = string;

export type OpenAction = Values<typeof C.OPEN_ACTION>;

export type UpdateAction = Values<typeof C.UPDATE_ACTION>;

export type CloseAction = Values<typeof C.CLOSE_ACTION>;

export type NoResultsMode = Values<typeof C.NO_RESULTS_MODE>;

export type SortMode = Values<typeof C.SORT_MODE>;

export type HyperItemType = Values<typeof C.HYPER_ITEM>;

export type HyperActionableType = typeof C.HYPER_ITEM.ACTIONABLE;

export type HyperNavigableType = typeof C.HYPER_ITEM.NAVIGABLE;

export type HyperSearchableType = typeof C.HYPER_ITEM.SEARCHABLE;

export type ActionableCloseOn = Values<typeof C.ACTIONABLE_CLOSE_ON>;

export type NavigableCloseOn = Values<typeof C.NAVIGABLE_CLOSE_ON>;

export type SearchableCloseOn = Values<typeof C.SEARCHABLE_CLOSE_ON>;

//
// User defined preferences
//

export type GlobalUserActionable = Register extends { HyperActionable: infer _Config; }
    ? _Config extends {
        meta?: HyperItemMeta;
    } ? _Config : never
    : { meta: HyperItemMeta; };

export type GlobalUserNavigable = Register extends { HyperNavigable: infer _Config; }
    ? _Config extends {
        meta?: HyperItemMeta;
    } ? _Config : never
    : { meta: HyperItemMeta; };

export type GlobalUserSearchable = Register extends { HyperSearchable: infer _Config; }
    ? _Config extends {
        meta?: HyperItemMeta;
    } ? _Config : never
    : { meta: HyperItemMeta; };

export type GlobalUserItemsTrait = {
    [Name in string]: {
        type: HyperItemType;
        prefix: string;
        mode: string;
        meta?: HyperItemMeta;
    }
};

type InferUserMeta<T> = T extends never ? HyperItemMeta
    : T extends { meta: infer _Meta; }
    ? _Meta extends HyperItemMeta ? _Meta : never
    : HyperItemMeta;

export type GlobalActionableMeta = InferUserMeta<GlobalUserActionable>;

export type GlobalNavigableMeta = InferUserMeta<GlobalUserNavigable>;

export type GlobalSearchableMeta = InferUserMeta<GlobalUserNavigable>;

//
// Item traits
//

export type HyperItemMeta = Record<string, any>;

export type HyperItemId = HyperId | string;

export interface HyperItemBaseDef {
    /**
     * A unique identifier for the HyperItem. It must be unique across all items.
     * 
     * If not provided, a random unique identifier will be generated.
     */
    id?: HyperItemId;
    /**
     * Overrides the default `closeAction` for the current mode.
     * 
     * @see {@link HyperModeBaseConfig.closeAction} for more information.
     */
    closeAction?: CloseAction;
}

export interface HyperItemBase<T extends HyperItemType = HyperItemType> {
    /**
     * @internal do not override.
     * 
     * Discriminator for the type of HyperItem.
     */
    readonly type: T;
    /**
     * A unique identifier for the HyperItem. It must be unique across all items.
     * 
     * If not provided, a random unique identifier will be generated.
     */
    readonly id: HyperItemId;
    /**
     * Display name for the HyperItem.
     */
    name: string;
    /**
     * @internal use under your own risk.
     *
     * Record for storing computed values.
     */
    readonly hcache: Record<string, any>;
}

export type ItemRequestSource =
    | { type: 'submit'; event: SubmitEvent; }
    | { type: 'shortcut'; event: KeyboardEvent; shortcut: string; }
    | { type: 'click'; event: MouseEvent; };

export interface HyperActionableDef<RR = unknown> extends HyperItemBaseDef {
    /**
     * Display name of the HyperActionable.
     */
    name: string;
    /**
     * Category of the HyperActionable. Can be used to group items in the palette.
     */
    category?: string;
    /**
     * Description of the HyperActionable. Can be used to provide additional information in the palette.
     */
    description?: string;
    /**
     * Shortcut/s to trigger the HyperActionable.
     */
    shortcut?: string[];
    /**
     * Hook to determine whether the HyperActionable can be executed.
     * 
     * If its async, the palette will wait for it to resolve before continuing.
     * 
     * Return value interpretation:
     * - Returning `false` prevents the item from being executed.
     * - Returning other value than else will be passed to the `onAction` hook as last argument.
     */
    onRequest?: (args: {
        item: HyperActionable;
        source: ItemRequestSource;
    }) => MaybePromise<RR>;
    /**
     * Hook to call when the user triggers the HyperActionable.
     * 
     * If its async, the palette will wait for it to resolve before continuing.
     */
    onAction: (args: {
        item: HyperActionable;
        rarg: RR;
        source: ItemRequestSource;
    }) => MaybePromise<void>;
    /**
     * Hook to handle errors during the execution of the HyperActionable.
     * 
     * If its async, the palette won't wait for it to resolve before continuing.
     * 
     * If not provided, the error will be silently ignored.
     */
    onError?: (args: {
        error: unknown;
        item: HyperActionable;
        source: ItemRequestSource;
    }) => MaybePromise<void>;
    /**
     * Hook for cleaning up resources when the HyperActionable is unregistered.
     */
    onUnregister?: (item: HyperActionable) => void;
    /**
     * Overrides the default `closeOn` for the mode of the HyperActionable.
     * 
     * @see {@link PaletteOptions.modes} for more information.
     */
    closeOn?: ActionableCloseOn;
    /**
     * User-defined metadata of the shape `Record<string, unknown>`.
     * 
     * Can be set by extending the `Register` interface with the `HyperActionable` prop in the `svelte-hypercommands` module.
     */
    meta?: GlobalActionableMeta;
}

export type HyperActionable<RR = unknown> =
    | HyperItemBase<HyperActionableType>
    & Required<Pick<HyperActionableDef<RR>, 'category' | 'description' | 'onRequest' | 'onAction' | 'shortcut' | 'meta'>>
    & Pick<HyperActionableDef<RR>, 'onError' | 'onUnregister' | 'closeAction' | 'closeOn'>;

export interface HyperNavigableDef extends HyperItemBaseDef {
    /**
     * The url of the HyperNavigable.
     * 
     * If the url starts with '/', it's considered a local url otherwise it's treated as an external url.
     * 
     * External urls must be valid according to the URL standard.
     */
    url: string;
    /**
     * Display name of the HyperNavigable.
     * 
     * If not provided, the name will be inferred from the last part of the url pathname or 'index' if the pathname is '/'.
     */
    name?: string;
    /**
     * Overrides the default `closeOn` for the mode of the HyperNavigable.
     * 
     * @see {@link PaletteOptions.modes} for more information.
     */
    closeOn?: NavigableCloseOn;
    /**
     * User-defined metadata of the shape `Record<string, unknown>`.
     * 
     * Can be set by extending the `Register` interface with the `HyperNavigable` prop in the `svelte-hypercommands` module.
     */
    meta?: GlobalNavigableMeta;
}

export type HyperNavigable =
    | HyperItemBase<HyperNavigableType>
    & {
        /**
         * Flag indicating whether the HyperNavigable is an external url.
         * 
         * Inferred from the provided `url`.
         */
        readonly external: boolean;
        /**
         * The url of the HyperNavigable.
         * 
         * If the url starts with '/', it's considered a local url otherwise it's treated as an external url.
         * 
         * External urls must be valid according to the URL standard.
         */
        readonly url: string;
        /**
         * The host and pathname of the HyperNavigable.
         * 
         * For local urls this is equivalent to the pathname.
         */
        readonly urlHostPathname: string;
    }
    & Required<Pick<HyperNavigableDef, 'meta'>>
    & Pick<HyperNavigableDef, 'closeOn'>;

export interface HyperSearchableDef extends HyperItemBaseDef {
    /**
     * Data that corresponds to the HyperSearchable.
     * 
     * It can be any value.
     */
    data: any;
    /**
     * Overrides the default `closeOn` for the mode of the HyperSearchable.
     * 
     * @see {@link PaletteOptions.modes} for more information.
     */
    closeOn?: SearchableCloseOn;
    /**
     * User-defined metadata of the shape `Record<string, unknown>`.
     * 
     * Can be set by extending the `Register` interface with the `HyperSearchable` prop in the `svelte-hypercommands` module.
     */
    meta?: GlobalSearchableMeta;
    /**
     * Optional display name of the HyperSearchable.
     */
    name?: string;
}

export type HyperSearchable =
    | HyperItemBase<HyperSearchableType>
    & Required<Pick<HyperSearchableDef, 'data' | 'meta'>>
    & Pick<HyperSearchableDef, 'closeOn'>;

export type ItemTypeToDef =
    | { [K in HyperActionableType]: HyperActionableDef }
    & { [K in HyperNavigableType]: HyperNavigableDef }
    & { [K in HyperSearchableType]: HyperSearchableDef };

export type ItemTypeToItem =
    | { [K in HyperActionableType]: HyperActionable }
    & { [K in HyperNavigableType]: HyperNavigable }
    & { [K in HyperSearchableType]: HyperSearchable };

export type AnyHyperItem = ItemTypeToItem[HyperItemType];

export type ItemMatcher<T extends AnyHyperItem> = HyperItemId | T | ((item: T) => boolean);

type ItemTypeToSortableKeys =
    | { [K in HyperActionableType]: Tuple<keyof Pick<HyperActionable, 'name' | 'category' | 'description' | 'id'>> }
    & { [K in HyperNavigableType]: Tuple<keyof Pick<HyperNavigable, 'name' | 'url' | 'urlHostPathname' | 'id'>> }
    & { [K in HyperSearchableType]: Tuple<keyof Pick<HyperSearchable, 'name' | 'id'>> };

export type HyperItemSorter<T extends HyperItemType, Item extends AnyHyperItem = ItemTypeToItem[T]> =
    | ItemTypeToSortableKeys[T]
    | ((items: Item[]) => Item[]);

export type HyperModeBaseConfig<T extends HyperItemType> = {
    /**
     * The type of HyperItem.
     */
    type: T;
    /**
     * Prefix used in the search input for setting the mode.
     */
    prefix: string;
    /**
     * Function to map the item to a searchable string of the desired item's properties.
     */
    mapToSearch: (item: ItemTypeToItem[T]) => string;
    /**
     * Shortcut/s to open the palette in the given mode.
     * 
     * @default []
     */
    shortcut: string[];
    /**
     * Defines the action to take when the palette opens in this mode.
     * 
     * - `NO_ACTION`: Does nothing. The state remains the same as before the palette was opened.
     * - `RESET`: Resets the state to its default value.
     * - `UPDATE`: Updates the state with the current value of the search input.
     * 
     * This option takes precedence over the `closeAction` option.
     * 
     * @default "RESET"
     */
    openAction: OpenAction;
    /**
     * Defines the action to take when the items are updated in this mode.
     * 
     * - `NO_ACTION`: Does nothing. The state remains the same as before the items were updated.
     * - `UPDATE`: Updates the results.
     * - `UPDATE_IF_OPEN`: Updates the results if the palette is open in this mode.
     * - `UPDATE_IF_CURRENT`: Updates the results if this is the current mode of the palette regardless of being open or not.
     * 
     * @default "UPDATE_IF_OPEN"
     */
    updateAction: UpdateAction;
    /**
     * Defines the action to take when the palette closes in this mode.
     * 
     * - `NO_ACTION`: Does nothing. The state remains the same as before the palette was closed.
     * - `CLOSE`: Closes the palette and sets `selected` state to default.
     * - `RESET`: Resets the state to its default value.
     * - `RESET_CLOSE`: Resets the state to its default value and closes the palette.
     * 
     * This option takes precedence over the `openAction` option.
     * 
     * @default "CLOSE"
     */
    closeAction: CloseAction;
    /**
     * What set of items to display if there is no input.
     * 
     * - `ALL`: Display all items.
     * - `HISTORY`: Display the items in the history.
     * - `EMPTY`: Display no items.
     * 
     * @default "ALL"
     */
    emptyMode: NoResultsMode;
    /**
     * How the items should be sorted.
     * 
     * It can be a list of keys of the item properties to be used in that order to use as the sorting keys
     * or a function that receives the items and sorts them inplace.
     * 
     * If not provided, the items will be sorted by the `mapToSearch` function.
     */
    sortBy?: HyperItemSorter<T>;
    /**
     * How to sort the items results.
     * 
     * - `SORTED`: The items keep the order of the `sortBy` | `mapToSearch` functions or ascending if sortBy is an array of keys.
     * - `REVERSE`: Reverses the results of the `SORTED` mode.
     * - `NONE`: The items are not sorted. They are displayed in the order of registration.
     * 
     * @default "SORTED"
     */
    sortMode: SortMode;
};

export interface HyperActionableConfig extends HyperModeBaseConfig<HyperActionableType> {
    /**
     * Defines if the palette should automatically close.
     * 
     * - `ALWAYS`: The palette will close after the action is canceled, successful or an error occurs.
     * - `NEVER`: The palette will never close automatically.
     * - `ON_TRIGGER`: The palette will close before starting the action.
     * - `ON_CANCEL`: The palette will close after the action is canceled.
     * - `ON_SUCCESS`: The palette will close after the action is successful.
     * - `ON_ERROR`: The palette will close after an error occurs.
     * 
     * @default "ALWAYS"
     */
    closeOn: ActionableCloseOn;
}

export type HyperActionableOptions =
    Pick<
        HyperActionableConfig,
        'type' | 'mapToSearch' | 'prefix'
    >
    & Partial<Omit<
        HyperActionableConfig,
        'type' | 'mapToSearch' | 'prefix'
    >>;

export interface HyperNavigableConfig extends HyperModeBaseConfig<HyperNavigableType> {
    /**
     * Defines if the palette should automatically close.
     * 
     * - `ALWAYS`: The palette will close after the navigation is successful or an error occurs.
     * - `NEVER`: The palette will never close automatically.
     * - `ON_TRIGGER`: The palette will close before starting the navigation.
     * - `ON_SUCCESS`: The palette will close after the navigation is successful.
     * - `ON_ERROR`: The palette will close after an error occurs.
     * 
     * @default "ALWAYS"
     */
    closeOn: NavigableCloseOn;
    /**
     * Hook to handle external navigations.
     * 
     * If returns a promise, the palette will wait for it to resolve before continuing.
     * 
     * @default (url) => window.open(url, '_blank', 'noopener')
     */
    onExternal: (url: string) => MaybePromise<void>;
    /**
     * Hook to handle local navigations.
     * 
     * If returns a promise, the palette will wait for it to resolve before continuing.
     * 
     * @default (url) => window.location.href = url
     */
    onLocal: (url: string) => MaybePromise<void>;
    /**
     * Hook to call when the user triggers the navigable item.
     * 
     * If returns a promise, the palette will wait for it to resolve before continuing.
     * 
     * If provided, the `onExternal` and `onLocal` hooks will not be called.
     */
    onNavigation?: (item: HyperNavigable) => MaybePromise<void>;
    /**
     * Hook to handle errors during the navigation.
     * 
     * If not provided, the error will be silently ignored.
     */
    onError?: (args: { error: unknown, item: HyperNavigable, source: ItemRequestSource; }) => MaybePromise<void>;
}

export type HyperNavigableOptions =
    Pick<
        HyperNavigableConfig,
        'type' | 'mapToSearch' | 'prefix'
    >
    & Partial<Omit<
        HyperNavigableConfig,
        'type' | 'mapToSearch' | 'prefix'
    >>;

export interface HyperSearchableConfig extends HyperModeBaseConfig<HyperSearchableType> {
    /**
     * Defines if the palette should automatically close.
     * 
     * - `ALWAYS`: The palette will close after the selection is successful or an error occurs.
     * - `NEVER`: The palette will never close automatically.
     * - `ON_TRIGGER`: The palette will close before starting the selection.
     * - `ON_SUCCESS`: The palette will close after the selection is successful.
     * - `ON_ERROR`: The palette will close after an error occurs.
     * 
     * @default "ALWAYS"
     */
    closeOn: SearchableCloseOn;
    /**
     * Hook to call when the user triggers the searchable item.
     * 
     * If its async, the palette will wait for it to resolve before continuing.
     */
    onSelection: (args: {
        item: HyperSearchable;
        source: ItemRequestSource;
    }) => MaybePromise<void>;
    /**
     * Hook to handle errors during the selection.
     * 
     * If its async, the palette won't wait for it to resolve before continuing.
     * 
     * If not provided, the error will be silently ignored.
     */
    onError?: (args: {
        error: unknown;
        item: HyperSearchable;
        source: ItemRequestSource;
    }) => MaybePromise<void>;
}

export type HyperSearchableOptions =
    Pick<
        HyperSearchableConfig,
        'type' | 'mapToSearch' | 'prefix' | 'onSelection'
    >
    & Partial<Omit<
        HyperSearchableConfig,
        'type' | 'mapToSearch' | 'prefix' | 'onSelection'
    >>;

type ItemTypeToModeOptions =
    | { [K in HyperActionableType]: HyperActionableOptions }
    & { [K in HyperNavigableType]: HyperNavigableOptions }
    & { [K in HyperSearchableType]: HyperSearchableOptions };

export type AnyHyperModeOptions = {
    [T in HyperItemType]: ItemTypeToModeOptions[T];
}[HyperItemType];

export type PaletteElements = {
    palette: HTMLElement;
    panel: HTMLElement;
    form: HTMLFormElement;
    label: HTMLLabelElement;
    input: HTMLInputElement;
    item: HTMLElement;
};

export type PaletteIds = {
    [K in keyof Omit<PaletteElements, 'item'>]: string;
};

export type PaletteDefaultsOptions<T extends string = string> = {
    /**
     * Ids for the different elements of the palette.
     * 
     * If not provided, random unique ids will be generated.
     */
    ids?: PaletteIds;
    /**
     * Default mode of the palette.
     */
    mode?: T;
    /**
     * Whether the palette should be open by default.
     * 
     * @default false
     */
    open: boolean;
    /**
     * Placeholder for the search input.
     */
    placeholder?: string;
    /**
     * Initial text for the search input.
     * 
     * If provided, the palette mode will be inferred from it taking precedence over the `mode` option.
     * 
     * @default ""
     */
    search: string;
};

export type PaletteModesOptions = Record<string, AnyHyperModeOptions>;

export type PaletteOptions = {
    /**
     * Whether to close the palette when the user clicks outside of it.
     * 
     * @default true
     */
    closeOnClickOutside: boolean;
    /**
     * Whether to close the palette when the user presses the escape key.
     * 
     * @default true
     */
    closeOnEscape: boolean;
    /**
     * Debounce time for processing the search input in milliseconds.
     * 
     * A value greater than 0 will debounce the input. Otherwise, the input will be processed immediately.
     * 
     * @default 150
     */
    debounce: number;
    /**
     * Default values for initializing the palette.
     */
    defaults: PaletteDefaultsOptions<string>;
    /**
     * **IMPORTANT: Must exist a mode with '' as prefix as the default mode.**
     * 
     * The configuration for the different modes of the palette.
     * 
     * Each key is the name of the mode and the value is the configuration for that mode.
     */
    modes: PaletteModesOptions;
    /**
     * A `Writable` store to control the open state of the palette from outside.
     */
    open: Writable<boolean>;
    /**
     * A `Writable` store to control the placeholder of the search input from outside.
     */
    placeholder: Writable<string | undefined>;
    /**
     * The target element to append the palette to.
     * 
     * - `false` portal is disabled.
     * - `string` a css selector for the portal target.
     * - `HTMLElement` the portal target.
     * 
     * @default false
     */
    portal: HTMLElement | string | false;
};

export type CreatePaletteOptions =
    | DeepPartial<
        Pick<
            PaletteOptions,
            | 'closeOnClickOutside' | 'closeOnEscape'
            | 'debounce'
            | 'defaults'
            | 'open' | 'placeholder'
            | 'portal'
        >
    >
    & Pick<PaletteOptions, 'modes'>;

export type PaletteModeSort =
    | {
        type: 'search';
        mapper: (item: any) => string;
        sorter: (items: any[]) => void;
    }
    | {
        type: 'keys';
        mapper: (item: any) => string;
        sorter: (items: any[]) => void;
    }
    | {
        type: 'custom';
        sorter: (items: any[]) => void;
    };

type ItemTypeToModeConfig =
    | { [K in HyperActionableType]: HyperActionableConfig }
    & { [K in HyperNavigableType]: HyperNavigableConfig }
    & { [K in HyperSearchableType]: HyperSearchableConfig };

export type AnyHyperModeConfig = HyperActionableConfig | HyperNavigableConfig | HyperSearchableConfig;

export type PaletteModesConfigs = Record<string, AnyHyperModeConfig>;

export type PaletteModeState<
    T extends HyperItemType = HyperItemType,
    Mode extends string = string,
    Item extends AnyHyperItem = ItemTypeToItem[T],
> =
    {
        mode: Mode;
        config: ItemTypeToModeConfig[T];
        sort: PaletteModeSort;
        items: WritableExposed<Item[]>;
        results: WritableExposed<Item[]>;
        history: WritableExposed<HyperItemId[]>;
        searcher: Searcher<Item>;
        current: WritableExposed<Item | undefined>;
        rawAll: Item[];
        rawAllSorted: Item[];
        lastInput: string;
    };

export type PaletteSelected = {
    el: HTMLElement | undefined;
    id: HyperId | string | undefined;
    idx: number;
};

type PaletteModesConfigsBase = Record<string, Pick<AnyHyperModeConfig, 'type' | 'mapToSearch' | 'prefix'>>;

export type PaletteError<T extends PaletteModesConfigsBase, Modes extends string = keyof T & string> = {
    [Mode in Modes]: {
        error: unknown;
        mode: Mode;
        item: ItemTypeToItem[T[Mode]['type']];
        source: ItemRequestSource;
    };
}[Modes];

export type PaletteModesReturn<T extends PaletteModesConfigsBase> = {
    [Mode in keyof T]: {
        items: Writable<ItemTypeToItem[T[Mode]['type']][]>;
        results: Writable<ItemTypeToItem[T[Mode]['type']][]>;
        history: Writable<HyperItemId[]>;
        current: Writable<ItemTypeToItem[T[Mode]['type']] | undefined>;
    };
};

export type CreatePaletteReturn<T extends PaletteModesConfigsBase, Modes extends string = keyof T & string> = {
    elements: {
        [K in keyof PaletteElements]: any;
    };
    helpers: {
        registerItem: <Mode extends Modes>(mode: Mode, item: OneOrMany<ItemTypeToItem[T[Mode]['type']]>, override?: boolean, silent?: boolean) => Cleanup;
        unregisterItem: <Mode extends Modes>(mode: Mode, item: OneOrMany<ItemMatcher<ItemTypeToItem[T[Mode]['type']]>>) => void;
        search: (pattern: string) => void;
        openPalette: (mode?: Modes) => void;
        closePalette: () => void;
        togglePalette: () => void;
        registerPaletteShortcuts: () => void;
        unregisterPaletteShortcuts: () => void;
    };
    states: {
        open: Writable<boolean>;
        error: Writable<PaletteError<T> | undefined>;
        mode: Writable<Modes>;
        modes: PaletteModesReturn<T>;
        placeholder: Writable<string | undefined>;
        portal: Writable<HTMLElement | string | false>;
        searchInput: Writable<string>;
    };
};
