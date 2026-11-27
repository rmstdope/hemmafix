/**
 * For a test whose outcome the project cannot change, because it sets its own viewport before it
 * loads anything or loads no page at all: it runs in `mobile` only, whose pixel ratio the
 * exact-pixel assertions want.
 */
export const RUN_ONCE = "@run-once";
