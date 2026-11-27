/**
 * For a test that runs in `mobile` only. Either the project cannot change its outcome, because it
 * sets its own viewport before it loads anything or loads no page at all (and mobile's pixel ratio
 * is the one the exact-pixel assertions want), or the viewport cannot change what it proves (server
 * rules, coin arithmetic, history and the like) and the navigator has approved running it once.
 * Tests of layout, the header, menus, touch or narrow screens run on both.
 */
export const RUN_ONCE = "@run-once";
