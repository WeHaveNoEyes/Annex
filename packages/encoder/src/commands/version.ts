/**
 * Version Command
 *
 * Displays version information.
 */

import * as os from "node:os";
import { BUILD_DATE, BUILD_TIMESTAMP, VERSION } from "../version.js";

export function version(): void {
  console.log(`
Annex Encoder ${VERSION}

Build Date:   ${BUILD_DATE}
Build Time:   ${new Date(BUILD_TIMESTAMP).toLocaleString()}
Platform:     ${os.platform()}-${os.arch()}
`);
}
