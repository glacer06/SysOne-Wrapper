import type { Linter } from "eslint";

export declare const ignores: Linter.Config[];
export declare const boundariesConfig: Linter.Config[];
export declare const purityConfig: Linter.Config[];
/** The shared config plus the purity rules, for core and codegen. */
export declare const pure: Linter.Config[];
declare const sysone: Linter.Config[];
export default sysone;
