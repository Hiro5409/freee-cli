// These should all be caught by the no-unlimited-disable Oxlint rule

// oxlint-disable-next-line -- a reason is given, but no rule is named
const nextLine = 1;

/* oxlint-disable -- silences every rule for the rest of the file */
const block = 2;

export { block, nextLine };
