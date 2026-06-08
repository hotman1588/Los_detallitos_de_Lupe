/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DivipolaStructure {
  [municipio: string]: {
    [localidad: string]: string[];
  };
}

export const DIVIPOLA_DATA: DivipolaStructure = {
  "Bogotá D.C.": {
    "Usaquén (Localidad 1)": [
      "Cedritos",
      "Santa Bárbara",
      "Toberín",
      "San Cristóbal Norte",
      "Bella Suiza",
      "La Carolina",
      "Orquídeas"
    ],
    "Chapinero (Localidad 2)": [
      "Chicó",
      "El Retiro",
      "Lago Gaitán",
      "Marly",
      "El Nogal",
      "Rosales",
      "San Luis"
    ],
    "Suba (Localidad 11)": [
      "Niza",
      "Mazurén",
      "La Colina Campestre",
      "Grata Mira",
      "Suba Compartir",
      "Lombardía",
      "El Rincón"
    ],
    "Teusaquillo (Localidad 13)": [
      "Palermo",
      "Galerías",
      "La Esmeralda",
      "Ciudad Salitre Oriental",
      "Quinta Paredes",
      "Nicolás de Federmán"
    ],
    "Fontibón (Localidad 9)": [
      "Modelia",
      "Hayuelos",
      "Ciudad Salitre Occidental",
      "Fontibón Centro",
      "Capellanía",
      "Zona Franca"
    ],
    "Kennedy (Localidad 8)": [
      "Castilla",
      "Timiza",
      "Carvajal",
      "Ciudad Kennedy Centro",
      "Marsella",
      "Patio Bonito",
      "Americas Occidental"
    ],
    "Bosa (Localidad 7)": [
      "Bosa Centro",
      "El Recreo",
      "Chicalá",
      "San Bernardino",
      "Los Naranjos",
      "La Palestina"
    ],
    "Puente Aranda (Localidad 16)": [
      "Ciudad Montes",
      "Muzu",
      "Alquería",
      "Milenta",
      "Salazar Gómez",
      "Pensilvania"
    ],
    "Engativá (Localidad 10)": [
      "Villas de Granada",
      "Minuto de Dios",
      "Las Ferias",
      "Garces Navas",
      "Santa Helenita",
      "Normandía",
      "Quirigua"
    ],
    "Barrios Unidos (Localidad 12)": [
      "Siete de Agosto",
      "La Castellana",
      "El Polo",
      "Alcázares",
      "Doce de Octubre",
      "Rionegro"
    ]
  },
  "Soacha": {
    "Comuna 1 - Compartir": [
      "Compartir",
      "Ciudad Latina",
      "Llanos de Soacha",
      "Quintanar de la Sabana",
      "Parque Campestre"
    ],
    "Comuna 2 - Centro": [
      "Centro Soacha",
      "La Unión",
      "El Sol",
      "Praderas de Soacha",
      "Las Villas"
    ],
    "Comuna 3 - La Despensa": [
      "La Despensa",
      "León XIII",
      "Ciudad Verde",
      "La Amistad",
      "Los Olivos"
    ],
    "Comuna 5 - San Mateo": [
      "San Mateo",
      "Rincón de Santafé",
      "El Portal",
      "Casalinda",
      "Sumapaz"
    ],
    "Comuna 6 - San Humberto": [
      "San Humberto",
      "Cabañas de Soacha",
      "Chicó Sur",
      "La Florida"
    ]
  }
};
