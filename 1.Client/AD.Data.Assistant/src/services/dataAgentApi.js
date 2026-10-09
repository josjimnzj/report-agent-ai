// Punto único de acceso al agente: backend real en modo API, datos en duro en modo maqueta.
import * as mock from './dataAgentApi.mock';
import * as real from './dataAgentApi.real';
import { IS_API } from './mode';

export { IS_API };
const impl = IS_API ? real : mock;

export const getModels = (...a) => impl.getModels(...a);
export const streamQuery = (...a) => impl.streamQuery(...a);
