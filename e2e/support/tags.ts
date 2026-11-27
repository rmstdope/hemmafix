/**
 * For a test that runs in `mobile` only, whose pixel ratio the exact-pixel assertions want. Either
 * the project cannot change its outcome, because it sets its own viewport before it loads anything
 * or loads no page at all, or the viewport cannot change what it proves (server rules, coin
 * arithmetic, history and the like) and the navigator has approved running it once. Tests of
 * layout, the header, menus, touch or narrow screens run on both.
 */
export const RUN_ONCE = "@run-once";
