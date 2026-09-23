/**
 * Python 因子代码校验（kind='python'）。
 *
 * 说明：这里只是「快速拒绝」——在写入数据库前挡掉明显违规的源码，给用户即时反馈。
 * 真正的安全边界在 quant 侧（apps/quant/factor_code.py）：AST 白名单 + 受限 builtins +
 * 子进程超时。两处规则保持同源：都禁止 import / 双下划线 / 危险内置函数，都要求定义 compute。
 */

/** Python 因子代码长度上限 */
const MAX_CODE_LENGTH = 5000;

/** 与 quant 侧 factor_code.py 保持一致的禁用模式 */
const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bimport\b/, reason: "禁止使用 import 语句" },
  { pattern: /\b(global|nonlocal)\b/, reason: "禁止使用 global / nonlocal" },
  { pattern: /\basync\b|\bawait\b/, reason: "禁止使用 async / await" },
  { pattern: /\byield\b/, reason: "禁止使用生成器（yield）" },
  { pattern: /__/, reason: "禁止访问双下划线（dunder）名称" },
  {
    pattern:
      /\b(eval|exec|compile|open|input|breakpoint|globals|locals|vars|getattr|setattr|delattr|memoryview|__import__)\s*\(/,
    reason: "禁止调用不安全的內置函数",
  },
  { pattern: /@\s*[A-Za-z_]/, reason: "禁止使用装饰器" },
];

/** 必须定义的入口函数签名：compute(...)，且只接收一个参数（参数名不限，与 quant 侧 _find_entry 一致） */
const COMPUTE_PATTERN = /^\s*def\s+compute\s*\(\s*[A-Za-z_]\w*\s*(?:=\s*[^,)]+)?\s*\)\s*:/m;

export type FactorCodeValidation = { ok: true } | { ok: false; reason: string };

/**
 * 校验 Python 因子代码：限定为「定义 compute(data) 并返回与其等长的因子序列」的纯计算代码。
 *
 * @param code 待校验的 Python 源码
 * @returns ok=true 表示可通过；ok=false 时 reason 说明违规原因
 */
export function validateFactorCode(code: string): FactorCodeValidation {
  const text = (code ?? "").trim();
  if (!text) return { ok: false, reason: "代码为空" };
  if (text.length > MAX_CODE_LENGTH) {
    return { ok: false, reason: `代码过长（上限 ${MAX_CODE_LENGTH} 字符）` };
  }

  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) return { ok: false, reason };
  }

  if (!COMPUTE_PATTERN.test(text)) {
    return { ok: false, reason: "必须定义 compute(data) 函数（只接收一个参数）" };
  }

  return { ok: true };
}
