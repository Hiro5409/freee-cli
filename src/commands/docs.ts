import { define } from "gunshi";

import { documentationTopics, findDocumentationTopic } from "../docs.ts";
import { CliError } from "../errors.ts";
import { globalArgs } from "../global-args.ts";
import { formatValue } from "../output/formatter.ts";

const docsHelp = "Run `freee docs show <name>` to read a topic.";

const docsListCommand = define({
  name: "list",
  description: "List bundled documentation topics",
  args: globalArgs,
  examples: "$ freee docs list --format json",
  run: (ctx) => {
    const results = documentationTopics.map(({ name, description }) => ({ name, description }));
    const human = [
      ...results.map(({ name, description }) => `${name}\t${description}`),
      docsHelp,
    ].join("\n");
    return formatValue({ results, help: docsHelp }, String(ctx.values.format), human);
  },
});

const docsShowCommand = define({
  name: "show",
  description: "Show a bundled documentation topic",
  args: {
    ...globalArgs,
    name: {
      type: "positional" as const,
      description: "Documentation topic name",
      required: true,
    },
  },
  examples: "$ freee docs show safe-writes",
  run: (ctx) => {
    const name = String(ctx.values.name);
    const topic = findDocumentationTopic(name);
    if (!topic) {
      throw new CliError(`Unknown documentation topic "${name}".`, {
        why: "The requested topic is not bundled with this version of freee-cli.",
        hint: 'Run "freee docs list --format json" and choose a listed name.',
      });
    }

    return formatValue(topic, String(ctx.values.format), topic.content);
  },
});

export const docsCommand = define({
  name: "docs",
  description: "Read documentation bundled with this freee-cli version",
  args: globalArgs,
  subCommands: {
    list: docsListCommand,
    show: docsShowCommand,
  },
  examples: `$ freee docs list --format json
$ freee docs show authentication`,
  run: () => docsHelp,
});
