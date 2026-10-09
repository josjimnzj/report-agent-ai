// Parser incremental de Server-Sent Events (text/event-stream). Las líneas que empiezan por «:» son keep-alive.

/** Crea un parser: feed(texto) devuelve los eventos completos { event, data } recibidos hasta ahora. */
export function createSseParser() {
  let buffer = '';
  return {
    feed(chunk) {
      buffer += chunk.replace(/\r\n/g, '\n');
      const events = [];
      let sep;
      while ((sep = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let event = 'message';
        const data = [];
        for (const line of raw.split('\n')) {
          if (!line || line.startsWith(':')) continue;
          const i = line.indexOf(':');
          const field = i < 0 ? line : line.slice(0, i);
          const value = i < 0 ? '' : line.slice(i + 1).replace(/^ /, '');
          if (field === 'event') event = value;
          else if (field === 'data') data.push(value);
        }
        if (data.length) events.push({ event, data: data.join('\n') });
      }
      return events;
    },
  };
}
