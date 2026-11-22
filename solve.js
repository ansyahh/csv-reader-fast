// A faster csv-reader 1.0.0: same answer for every input, written by hand in this session.
//
// It reads the text once, left to right, with the same broken-row policy as csv-reader
// 1.0.0 (vendor/csv-reader/index.js), but it jumps between delimiters with indexOf and
// regex scans and slices fields out in bulk instead of building every field one character
// at a time. The policy, in the same words as the reference:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled, "" inside
//     it one quote, and each CRLF or lone CR inside it is read as LF; what follows its
//     closing quote, up to the next comma or line break, is appended as it stands
//     (quote_junk, when the field ends); a quote that never closes is a literal character,
//     and the text after it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings, never
//     trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the records
//     after it (every record when header is false), each padded with "" (short_row, with
//     fields: its count) or cut (long_row, with extra: the cut fields) to the first record's
//     width;
//   - each error is {code, line, row}: line the 1-based line its record starts on (every
//     LF, CRLF and lone CR inside a quoted field counted), row its record's index in rows
//     (null for the header), in the order met, a field's quote_junk when the field ends and
//     a record's short_row or long_row when the record ends.
//
// How a field ended: 0 at a comma (the record goes on), 1 at a line break, 2 at the end
// of the text (the record ends). A field reader returns [value, ended, added], where
// added counts the characters it appended to the value it was given.

const DELIM = /[,\n\r]/g; // the next comma, line feed or carriage return
const QSP = /["\r\n]/g; // the next quote, carriage return or line feed inside quotes

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;
  const n = text.length;

  // The record being read: the line it starts on and the index in rows it takes (null:
  // the header). The field readers report their errors against these.
  let recordLine = 1;
  let recordRow = null;

  // Reads unquoted characters onto `value` up to the next comma or line break: a CR not
  // followed by LF is dropped (stray_cr). Returns [value, ended, added].
  function readUnquoted(value) {
    let added = 0;
    for (;;) {
      DELIM.lastIndex = pos;
      const m = DELIM.exec(text);
      if (m === null) {
        if (pos < n) {
          value += text.slice(pos, n);
          added += n - pos;
        }
        pos = n;
        return [value, 2, added];
      }
      const d = m.index;
      const ch = text.charCodeAt(d);
      if (ch === 44) {
        if (d > pos) {
          value += text.slice(pos, d);
          added += d - pos;
        }
        pos = d + 1;
        return [value, 0, added];
      }
      if (ch === 10) {
        if (d > pos) {
          value += text.slice(pos, d);
          added += d - pos;
        }
        pos = d + 1;
        line += 1;
        return [value, 1, added];
      }
      // A CR: a CRLF ends the field at a line break; a lone CR is dropped (stray_cr)
      // and the field goes on.
      if (d + 1 < n && text.charCodeAt(d + 1) === 10) {
        if (d > pos) {
          value += text.slice(pos, d);
          added += d - pos;
        }
        pos = d + 2;
        line += 1;
        return [value, 1, added];
      }
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      if (d > pos) {
        value += text.slice(pos, d);
        added += d - pos;
      }
      pos = d + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Returns [value, ended, added]
  // (added is 0 unless junk followed the closing quote).
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1; // the opening quote
    let parts = null; // the value's pieces, only when a doubled quote or a CR rewrites it
    let segStart = pos; // the start of the clean segment being scanned
    let closed = false;
    let closeIdx = -1;
    for (;;) {
      QSP.lastIndex = pos;
      const m = QSP.exec(text);
      if (m === null) break; // no closing quote ahead
      const d = m.index;
      const ch = text.charCodeAt(d);
      if (ch === 34) {
        if (d + 1 < n && text.charCodeAt(d + 1) === 34) {
          // A doubled quote is one literal quote.
          if (parts === null) parts = [];
          parts.push(text.slice(segStart, d));
          parts.push('"');
          pos = d + 2;
          segStart = d + 2;
          continue;
        }
        closed = true;
        closeIdx = d;
        break;
      }
      if (ch === 13) {
        // CRLF and a lone CR inside quotes are each one LF.
        if (parts === null) parts = [];
        parts.push(text.slice(segStart, d));
        parts.push('\n');
        line += 1;
        pos = d + 1 < n && text.charCodeAt(d + 1) === 10 ? d + 2 : d + 1;
        segStart = pos;
        continue;
      }
      // An LF inside quotes is kept as it is and counts as a line.
      line += 1;
      pos = d + 1;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after it is
      // read again as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted('"');
    }
    let value;
    if (parts === null) {
      value = text.slice(segStart, closeIdx);
    } else {
      parts.push(text.slice(segStart, closeIdx));
      value = parts.join('');
    }
    pos = closeIdx + 1;
    if (pos >= n) return [value, 2, 0];
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      return [value, 0, 0];
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      return [value, 1, 0];
    }
    if (c === 13 && pos + 1 < n && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return [value, 1, 0];
    }
    // What follows the closing quote is appended as it stands, up to the next comma
    // or line break.
    const junk = readUnquoted(value);
    if (junk[2] > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return junk;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let field;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field[0]);
    } while (field[1] === 0);

    // A line that held only stray CRs is left with no characters: no record (its
    // stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
