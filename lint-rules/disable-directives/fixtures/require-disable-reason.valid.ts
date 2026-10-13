// ordinary comment
// oxlint-disabled-looking prose
const inline = 1; // eslint-disable-line no-console -- stdout is this script's interface

// oxlint-disable-next-line no-console -- stdout is this script's interface
const single = 1;

/* oxlint-disable no-console -- the whole block writes progress to stdout */
const block = 2;

export { inline, block, single };
