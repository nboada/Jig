/**
 * A one-off message a server action leaves for the next page, shown there as a toast. It's in a
 * cookie the browser can read (and clears once shown), so it survives the action's redirect.
 * Only ever plain wording like "Note saved": nothing secret goes in it.
 */
export const FLASH_COOKIE = "jig_flash";
