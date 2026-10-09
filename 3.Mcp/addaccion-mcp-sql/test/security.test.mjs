import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryValidator } from '../dist/security.js';

const allowed = [
  'SELECT CreatedOn, CreatedBy FROM AD_Case',
  "SELECT TOP 10 CaseId, CreatedOn FROM AD_Case WHERE CreatedOn >= '2026-01-01' AND CreatedOn < '2026-02-01' ORDER BY CreatedOn DESC",
  "SELECT COUNT(*) FROM AD_Case WHERE CreatedOn BETWEEN '2026-01-01' AND '2026-01-31'",
  "SELECT * FROM AD_Case WHERE Status = 'A' OR Status = 'B'",
  'SELECT YEAR(CreatedOn) AS y, MONTH(CreatedOn) AS m, COUNT(*) AS n FROM AD_Case GROUP BY YEAR(CreatedOn), MONTH(CreatedOn)',
  "SELECT CAST(CreatedOn AS date) d FROM AD_Activity WHERE CONVERT(date, CreatedOn) = '2026-03-15'",
  'SELECT UpdatedOn, ModifiedOn, IsDeleted, AllowUpdate, LastExecution FROM AD_Case',
  "SELECT * FROM AD_Note WHERE Text LIKE '%create table%' OR Text = 'a -- b' OR Text = 'x /* y' OR Text = 'union select'",
  "SELECT N'Año', 'it''s' AS q FROM AD_Case",
  'SELECT [Update], [Create Date], "Delete" FROM AD_Case',
  'WITH c AS (SELECT CaseId, CreatedOn FROM AD_Case) SELECT * FROM c WHERE CreatedOn > DATEADD(day, -30, GETDATE())',
  'SELECT 1;',
  'SELECT * FROM AD_SP_Config',
];

const rejected = [
  ['CREATE TABLE x (a int)', /must start/],
  ['SELECT * INTO NewTable FROM AD_Case', /INTO/],
  ['SELECT 1; DROP TABLE AD_Case', /Multiple statements/],
  ['SELECT 1; SELECT 2', /Multiple statements/],
  ['SELECT 1 -- comment', /Comments/],
  ['SELECT /* x */ 1', /Comments/],
  ['WITH x AS (SELECT 1 a) UPDATE AD_Case SET a = 1', /UPDATE/],
  ['SELECT * FROM OPENROWSET(BULK \'c:\\x\', SINGLE_CLOB) x', /OPENROWSET|BULK/],
  ['SELECT * FROM OPENQUERY(srv, \'select 1\')', /OPENQUERY/],
  ['SELECT sp_who', /SP_WHO/],
  ['SELECT xp_cmdshell', /XP_CMDSHELL/],
  ['SELECT 1 WAITFOR DELAY \'00:00:10\'', /WAITFOR/],
  ['SELECT a FROM t UNION SELECT b FROM u', /UNION/],
  ["SELECT 'unterminated FROM t", /Unterminated/],
  ['SELECT [unterminated FROM t', /Unterminated/],
  ['EXEC sp_who', /must start/],
  ['', /Empty/],
];

for (const q of allowed) {
  test(`allows: ${q}`, () => {
    const r = QueryValidator.validateQuery(q);
    assert.equal(r.isValid, true, r.error);
  });
}

for (const [q, rx] of rejected) {
  test(`rejects: ${q}`, () => {
    const r = QueryValidator.validateQuery(q);
    assert.equal(r.isValid, false);
    assert.match(r.error, rx);
  });
}

test('maskSql neutralises literals and delimited identifiers', () => {
  const m = QueryValidator.maskSql("SELECT [Create], N'drop', 'a''b' FROM t");
  assert.doesNotMatch(m, /CREATE|DROP|a''b/i);
});

test('addRowLimit adds TOP after SELECT / DISTINCT and respects an existing TOP', () => {
  assert.equal(QueryValidator.addRowLimit('SELECT a FROM t', 5), 'SELECT TOP 5 a FROM t');
  assert.equal(QueryValidator.addRowLimit('SELECT DISTINCT a FROM t', 5), 'SELECT DISTINCT TOP 5 a FROM t');
  assert.equal(QueryValidator.addRowLimit('SELECT TOP 3 a FROM t', 5), 'SELECT TOP 3 a FROM t');
  assert.equal(QueryValidator.addRowLimit('SELECT DISTINCT TOP 3 a FROM t', 5), 'SELECT DISTINCT TOP 3 a FROM t');
  assert.equal(
    QueryValidator.addRowLimit('SELECT a FROM t WHERE a IN (SELECT TOP 1 b FROM u)', 5),
    'SELECT TOP 5 a FROM t WHERE a IN (SELECT TOP 1 b FROM u)'
  );
});

test('sanitizeQuery keeps whitespace inside literals', () => {
  assert.equal(QueryValidator.sanitizeQuery("  SELECT 'a  b' ;  "), "SELECT 'a  b' ");
});
