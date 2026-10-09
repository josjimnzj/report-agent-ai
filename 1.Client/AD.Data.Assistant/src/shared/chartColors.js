// Paleta categórica validada (orden fijo, apto para daltonismo en pares adyacentes).
// El color sigue a la sucursal, no a su posición: un filtro nunca repinta las que quedan.
export const CATEGORICAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

export const BRANCH_COLORS = {
  Centro: CATEGORICAL[0],
  Norte: CATEGORICAL[1],
  Sur: CATEGORICAL[2],
  Oriente: CATEGORICAL[3],
  Occidente: CATEGORICAL[4],
  'Pacífico': CATEGORICAL[5],
};

export const colorFor = (name, i = 0) => BRANCH_COLORS[name] ?? CATEGORICAL[i % CATEGORICAL.length];
