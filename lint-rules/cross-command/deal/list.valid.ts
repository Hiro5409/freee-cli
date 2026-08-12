// These should all PASS — no diagnostics expected

// コマンド root の外（helpers 等に相当）への import は自由
import { getThing } from "../../fixture.sdk.gen.ts";
// 自分のコマンド内のモジュールは import できる
import { dealLocal } from "./shared.ts";

export { dealLocal, getThing };
