/**
 * Validador de consultas de solo lectura.
 *
 * Las comprobaciones se hacen sobre una copia "enmascarada" del SQL: los literales ('...', N'...') y los
 * identificadores delimitados ([...], "...") se sustituyen por marcadores, y las palabras prohibidas se buscan
 * como palabras completas. Así CreatedOn, UpdatedOn, IsDeleted o un filtro
 * `CreatedOn BETWEEN '2026-01-01' AND '2026-02-01'` ya no se rechazan, mientras que CREATE, UPDATE, SELECT ... INTO,
 * varias sentencias o comentarios siguen bloqueados. El SQL que se ejecuta es el original.
 */
export class QueryValidator {
  private static readonly ALLOWED_STATEMENTS = [
    'SELECT',
    'WITH',
    'SHOW',
    'DESCRIBE',
    'EXPLAIN',
  ];

  private static readonly FORBIDDEN_KEYWORDS = [
    'INSERT',
    'UPDATE',
    'DELETE',
    'DROP',
    'CREATE',
    'ALTER',
    'TRUNCATE',
    'EXEC',
    'EXECUTE',
    'OPENROWSET',
    'OPENDATASOURCE',
    'OPENQUERY',
    'BULK',
    'MERGE',
    'GRANT',
    'REVOKE',
    'DENY',
    'INTO',
    'WAITFOR',
    'SHUTDOWN',
    'KILL',
    'DBCC',
    'BACKUP',
    'RESTORE',
    'RECONFIGURE',
  ];

  private static readonly LITERAL = ' __LIT__ ';
  private static readonly IDENTIFIER = ' __ID__ ';

  /**
   * Sustituye literales de texto e identificadores delimitados por marcadores neutros.
   * Devuelve null si hay un literal o identificador sin cerrar.
   */
  static maskSql(query: string): string | null {
    let out = '';
    let i = 0;
    while (i < query.length) {
      const ch = query[i]!;
      if (ch === "'" || ch === '"' || ch === '[') {
        const close = ch === '[' ? ']' : ch;
        let j = i + 1;
        let closed = false;
        while (j < query.length) {
          if (query[j] === close) {
            if (query[j + 1] === close) { j += 2; continue; } // '' "" ]] escapados
            closed = true;
            break;
          }
          j++;
        }
        if (!closed) return null;
        // N'...' : se descarta la N que precede al literal
        if (ch === "'" && /[Nn]$/.test(out) && !/[A-Za-z0-9_@#$]$/.test(out.slice(0, -1))) out = out.slice(0, -1);
        out += ch === "'" ? this.LITERAL : this.IDENTIFIER;
        i = j + 1;
        continue;
      }
      out += ch;
      i++;
    }
    return out;
  }

  static validateQuery(query: string): { isValid: boolean; error?: string } {
    if (!query || !query.trim()) {
      return { isValid: false, error: 'Empty query not allowed' };
    }

    const masked = this.maskSql(query);
    if (masked === null) {
      return { isValid: false, error: 'Unterminated string literal or delimited identifier' };
    }
    const normalized = masked.trim().toUpperCase();

    const startsWithAllowed = this.ALLOWED_STATEMENTS.some(stmt =>
      new RegExp(`^${stmt}\\b`).test(normalized)
    );
    if (!startsWithAllowed) {
      return {
        isValid: false,
        error: `Query must start with one of: ${this.ALLOWED_STATEMENTS.join(', ')}`,
      };
    }

    if (normalized.includes('--') || normalized.includes('/*')) {
      return { isValid: false, error: 'Comments (-- or /*) are not allowed' };
    }

    // Una sola sentencia: solo se admite un ';' final.
    if (/;\s*\S/.test(normalized)) {
      return { isValid: false, error: 'Multiple statements are not allowed' };
    }

    for (const forbidden of this.FORBIDDEN_KEYWORDS) {
      if (new RegExp(`\\b${forbidden}\\b`).test(normalized)) {
        return { isValid: false, error: `Forbidden keyword detected: ${forbidden}` };
      }
    }

    const proc = /\b((?:SP|XP)_\w*)/.exec(normalized);
    if (proc) {
      return { isValid: false, error: `Forbidden keyword detected: ${proc[1]} (system procedures are not allowed)` };
    }

    if (/\bUNION\b[\s\S]*\bSELECT\b/.test(normalized)) {
      return { isValid: false, error: 'Potential SQL injection pattern detected (UNION ... SELECT)' };
    }

    return { isValid: true };
  }

  static generateBluePrompt(query: string): string {
    return `
      <prompt_instructions>
        You are a senior security analyst AI. Your sole responsibility is to determine if a given SQL query is malicious.
        A query is considered malicious if it attempts to perform any of the following:
        - SQL Injection to bypass security or execute unauthorized commands.
        - Exfiltrate sensitive data (e.g., user credentials, PII).
        - Cause a Denial of Service (DoS) by consuming excessive resources.
        - Modify data (INSERT, UPDATE, DELETE) or schema (CREATE, ALTER, DROP).
        - Escalate privileges.

        Analyze the following SQL query:
        <sql_query>
        ${query}
        </sql_query>

        Your response MUST be a single word: 'true' if the query is safe for a read-only environment, or 'false' if it is malicious. Do not provide any explanation.
      </prompt_instructions>
    `;
  }

  static async validateQueryWithBluePrompt(query: string): Promise<{ isValid: boolean; error?: string }> {
    // Step 1: Perform initial static validation
    const staticValidation = this.validateQuery(query);
    if (!staticValidation.isValid) {
      return staticValidation;
    }

    // Step 2: Use the host AI platform for validation if a callback URL is provided
    const callbackUrl = process.env.BLUE_PROMPT_CALLBACK_URL;
    if (callbackUrl) {
      try {
        const bluePrompt = this.generateBluePrompt(query);
        const response = await fetch(callbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: bluePrompt }),
        });

        if (!response.ok) {
          throw new Error(`Callback to AI platform failed with status: ${response.status}`);
        }

        const verdict = (await response.text()).trim().toLowerCase();
        if (verdict !== 'true') {
          return { isValid: false, error: 'Query flagged as potentially malicious by the host AI platform' };
        }
      } catch (error) {
        console.error('Error during blue prompt callback:', error);
        // Fail-safe: if the callback fails, we deny the query execution.
        return { isValid: false, error: 'Could not verify query safety with the host AI platform' };
      }
    } else {
      // Fallback if no callback URL is provided
      console.log('Blue Prompt validation is a placeholder. Set BLUE_PROMPT_CALLBACK_URL to enable host AI validation.');
    }

    return { isValid: true };
  }

  static sanitizeQuery(query: string): string {
    return query
      .trim()
      .replace(/;\s*$/, ''); // Quita el ';' final (los literales no se tocan)
  }

  static addRowLimit(query: string, maxRows: number): string {
    // Si el SELECT principal ya trae TOP no se modifica (un TOP en una subconsulta no limita el resultado)
    if (/^\s*SELECT\s+(?:(?:DISTINCT|ALL)\s+)?TOP\b/i.test(query)) {
      return query;
    }

    // SELECT [DISTINCT|ALL] TOP n ...
    return query.replace(
      /^(\s*SELECT\s+(?:(?:DISTINCT|ALL)\s+)?)/i,
      `$1TOP ${maxRows} `
    );
  }
}
