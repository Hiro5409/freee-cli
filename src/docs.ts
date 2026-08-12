import authenticationSource from "../docs/authentication.md" with { type: "text" };
import resourceBoundariesSource from "../docs/resource-boundaries.md" with { type: "text" };
import safeWritesSource from "../docs/safe-writes.md" with { type: "text" };

export type DocumentationTopic = {
  name: string;
  description: string;
  content: string;
};

function parseTopic(name: string, source: string): DocumentationTopic {
  const match = /^---\ndescription: (.+)\n---\n\n([\s\S]+)$/u.exec(source.trim());
  if (!match?.[1] || !match[2]) {
    throw new Error(`Invalid documentation frontmatter: ${name}`);
  }

  return { name, description: match[1], content: match[2] };
}

export const documentationTopics = [
  parseTopic("authentication", authenticationSource),
  parseTopic("resource-boundaries", resourceBoundariesSource),
  parseTopic("safe-writes", safeWritesSource),
] as const;

export function findDocumentationTopic(name: string): DocumentationTopic | undefined {
  return documentationTopics.find((topic) => topic.name === name);
}
