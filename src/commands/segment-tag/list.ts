import { define } from "gunshi";

import { fetchAll } from "../../api/paginate.ts";
import { listArgs } from "../../global-args.ts";
import { initCommand, parseChoice, parseLimit } from "../../helpers.ts";
import { formatOutput } from "../../output/formatter.ts";
import { getSegmentTags } from "../../types/freee/sdk.gen.ts";

const SEGMENTS = ["1", "2", "3"] as const;

export const segmentTagListCommand = define({
  name: "segment-tag-list",
  description: "List tags for accounting segment 1, 2, or 3",
  args: {
    ...listArgs,
    segment: {
      type: "string" as const,
      description: "Segment number: 1 | 2 | 3",
      required: true,
    },
  },
  run: async (ctx) => {
    const { companyId, format } = initCommand(ctx);
    const segmentId = Number(parseChoice(ctx.values.segment, SEGMENTS, "--segment"));
    const tags = await fetchAll(async (offset, limit) => {
      const { data } = await getSegmentTags({
        path: { segment_id: segmentId },
        query: { company_id: companyId, offset, limit },
      });
      return data.segment_tags;
    }, parseLimit(ctx.values.limit));
    return formatOutput(tags, format);
  },
});
