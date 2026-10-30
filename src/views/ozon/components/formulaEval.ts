/**
 * 业务表「自定义公式」求值器（对齐飞书多维表格的公式字段）。
 *
 * 支持：
 *   · 数字（123、1.5、-2）
 *   · 四则运算 + - * / 与括号
 *   · 字段引用 `{列名}`（列名里可能有 `+` `/` 等符号，所以必须用花括号包起来）
 *   · 函数 round(x[, n]) / abs(x) / min(a,b,...) / max(a,b,...) / if(条件, 真值, 假值) 简版
 *   · 比较运算 > < >= <= = <>（只用于 if 的条件）
 *
 * 约定：任一引用字段为空/非数字 → 整条公式返回 null（页面显示「—」），
 * 与多维表格「任一空值则结果为空」的行为一致。
 */

export type FieldResolver = (label: string) => number | null | undefined;

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'field'; name: string }
  | { kind: 'ident'; name: string }
  | { kind: 'op'; value: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' }
  | { kind: 'comma' };

const FUNCTIONS = new Set(['round', 'abs', 'min', 'max', 'if', 'ceil', 'floor']);

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '{') {
      const end = input.indexOf('}', i + 1);
      if (end < 0) throw new Error(`字段引用缺少右花括号：${input.slice(i)}`);
      tokens.push({ kind: 'field', name: input.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9._]/.test(input[j])) j++;
      const raw = input.slice(i, j).replace(/_/g, '');
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`无法识别的数字：${raw}`);
      tokens.push({ kind: 'num', value });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j])) j++;
      tokens.push({ kind: 'ident', name: input.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if ('+-*/'.includes(ch)) {
      tokens.push({ kind: 'op', value: ch });
      i++;
      continue;
    }
    if (ch === '>') {
      if (input[i + 1] === '=') {
        tokens.push({ kind: 'op', value: '>=' });
        i += 2;
      } else {
        tokens.push({ kind: 'op', value: '>' });
        i++;
      }
      continue;
    }
    if (ch === '<') {
      if (input[i + 1] === '>') {
        tokens.push({ kind: 'op', value: '<>' });
        i += 2;
      } else if (input[i + 1] === '=') {
        tokens.push({ kind: 'op', value: '<=' });
        i += 2;
      } else {
        tokens.push({ kind: 'op', value: '<' });
        i++;
      }
      continue;
    }
    if (ch === '=') {
      tokens.push({ kind: 'op', value: '=' });
      i++;
      continue;
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i++;
      continue;
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i++;
      continue;
    }
    if (ch === ',') {
      tokens.push({ kind: 'comma' });
      i++;
      continue;
    }
    throw new Error(`不支持的字符：${ch}`);
  }
  return tokens;
}

/**
 * 编译公式，返回一个「按行求值」的函数。
 * 编译期抛错（语法问题）可以提前在面板里提示；求值期返回 null 表示该行有字段为空。
 */
export function compileFormula(expression: string, resolve: FieldResolver): () => number | null {
  const tokens = tokenize(expression || '');
  let pos = 0;
  let empty = false;

  const peek = () => tokens[pos];
  const eat = () => tokens[pos++];

  function parseExpression(): number {
    let left = parseTerm();
    while (peek() && peek().kind === 'op' && ['+', '-'].includes((peek() as { value: string }).value)) {
      const op = (eat() as { value: string }).value;
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    // 比较运算（给 if 用）
    while (peek() && peek().kind === 'op' && ['>', '<', '>=', '<=', '=', '<>'].includes((peek() as { value: string }).value)) {
      const op = (eat() as { value: string }).value;
      const right = parseTerm();
      switch (op) {
        case '>': left = left > right ? 1 : 0; break;
        case '<': left = left < right ? 1 : 0; break;
        case '>=': left = left >= right ? 1 : 0; break;
        case '<=': left = left <= right ? 1 : 0; break;
        case '=': left = left === right ? 1 : 0; break;
        default: left = left !== right ? 1 : 0;
      }
    }
    return left;
  }

  function parseTerm(): number {
    let left = parseUnary();
    while (peek() && peek().kind === 'op' && ['*', '/'].includes((peek() as { value: string }).value)) {
      const op = (eat() as { value: string }).value;
      const right = parseUnary();
      left = op === '*' ? left * right : right === 0 ? NaN : left / right;
    }
    return left;
  }

  function parseUnary(): number {
    const token = peek();
    if (token && token.kind === 'op' && token.value === '-') {
      eat();
      return -parseUnary();
    }
    if (token && token.kind === 'op' && token.value === '+') {
      eat();
      return parseUnary();
    }
    return parsePrimary();
  }

  function parseArgs(): number[] {
    const args: number[] = [];
    if (peek() && peek().kind === 'rparen') return args;
    args.push(parseExpression());
    while (peek() && peek().kind === 'comma') {
      eat();
      args.push(parseExpression());
    }
    return args;
  }

  function parsePrimary(): number {
    const token = peek();
    if (!token) throw new Error('公式不完整');
    if (token.kind === 'num') {
      eat();
      return token.value;
    }
    if (token.kind === 'field') {
      eat();
      const value = resolve(token.name);
      if (value === null || value === undefined || !Number.isFinite(Number(value))) {
        empty = true;
        return 0;
      }
      return Number(value);
    }
    if (token.kind === 'lparen') {
      eat();
      const value = parseExpression();
      if (!peek() || peek().kind !== 'rparen') throw new Error('括号不配对');
      eat();
      return value;
    }
    if (token.kind === 'ident') {
      eat();
      const name = token.name;
      if (!FUNCTIONS.has(name)) throw new Error(`不支持的函数：${name}`);
      if (!peek() || peek().kind !== 'lparen') throw new Error(`${name} 后面要跟括号`);
      eat();
      const args = parseArgs();
      if (!peek() || peek().kind !== 'rparen') throw new Error('括号不配对');
      eat();
      switch (name) {
        case 'round': {
          const digits = args.length > 1 ? Math.trunc(args[1]) : 0;
          const factor = 10 ** Math.min(Math.max(digits, 0), 8);
          return Math.round(args[0] * factor) / factor;
        }
        case 'abs': return Math.abs(args[0]);
        case 'min': return Math.min(...args);
        case 'max': return Math.max(...args);
        case 'ceil': return Math.ceil(args[0]);
        case 'floor': return Math.floor(args[0]);
        case 'if': return args[0] ? (args[1] ?? 0) : (args[2] ?? 0);
        default: throw new Error(`不支持的函数：${name}`);
      }
    }
    throw new Error('公式语法有误');
  }

  const result = parseExpression();
  if (pos < tokens.length) throw new Error('公式结尾有多余内容');
  void result;

  return () => {
    empty = false;
    pos = 0;
    const value = parseExpression();
    if (pos < tokens.length) throw new Error('公式语法有误');
    if (empty) return null;
    return Number.isFinite(value) ? value : null;
  };
}

/** 只校验语法（不取值），用于面板里保存前检查。 */
export function validateFormula(expression: string): string | null {
  try {
    compileFormula(expression, () => 0)();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : '公式语法有误';
  }
}
