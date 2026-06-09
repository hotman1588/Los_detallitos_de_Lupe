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
      "Orquídeas",
      "Verbenal",
      "Los Cedros",
      "Country Club"
    ],
    "Chapinero (Localidad 2)": [
      "Chicó",
      "El Retiro",
      "Lago Gaitán",
      "Marly",
      "El Nogal",
      "Rosales",
      "San Luis",
      "Chapinero Central",
      "Pardo Rubio",
      "Las Acacias"
    ],
    "Santa Fe (Localidad 3)": [
      "La Macarena",
      "Las Nieves",
      "La Perseverancia",
      "Las Cruces",
      "Lourdes",
      "El Dorado",
      "San Bernardo",
      "Egipto",
      "La Capuchina"
    ],
    "San Cristóbal (Localidad 4)": [
      "20 de Julio",
      "La Victoria",
      "San Blas",
      "Villa de los Alpes",
      "Bello Horizonte",
      "La Gloria",
      "Ramajal",
      "San Cristóbal Sur",
      "Los Libertadores",
      "Sosiego"
    ],
    "Usme (Localidad 5)": [
      "Santa Librada",
      "La Aurora",
      "El Virrey",
      "Gran Yomasa",
      "Alfonso López",
      "Comuneros",
      "Ciudad Usme",
      "La Flora",
      "Danubio Azul",
      "El Bosque"
    ],
    "Tunjuelito (Localidad 6)": [
      "Venecia",
      "Tunjuelito",
      "San Carlos",
      "El Carmen",
      "Fátima",
      "San Vicente Ferrer",
      "Isla del Sol",
      "Nuevo Muzú"
    ],
    "Bosa (Localidad 7)": [
      "Bosa Centro",
      "El Recreo",
      "Chicalá",
      "San Bernardino",
      "Los Naranjos",
      "La Palestina",
      "El Porvenir",
      "Bosa La Estación",
      "Villa del Río",
      "Metrovivienda"
    ],
    "Kennedy (Localidad 8)": [
      "Castilla",
      "Timiza",
      "Carvajal",
      "Ciudad Kennedy Centro",
      "Marsella",
      "Patio Bonito",
      "Américas Occidental",
      "El Tintal",
      "Class",
      "Corabastos",
      "Bavaria"
    ],
    "Fontibón (Localidad 9)": [
      "Modelia",
      "Hayuelos",
      "Ciudad Salitre Occidental",
      "Fontibón Centro",
      "Capellanía",
      "Zona Franca",
      "Versalles",
      "El Refugio",
      "Belén Fontibón"
    ],
    "Engativá (Localidad 10)": [
      "Villas de Granada",
      "Minuto de Dios",
      "Las Ferias",
      "Garcés Navas",
      "Santa Helenita",
      "Normandía",
      "Quirigua",
      "Bolivia",
      "El Encanto",
      "Florida Blanca"
    ],
    "Suba (Localidad 11)": [
      "Niza",
      "Mazurén",
      "La Colina Campestre",
      "Grata Mira",
      "Suba Compartir",
      "Lombardía",
      "El Rincón",
      "Tibabuyes",
      "San José de Bavaria",
      "La Floresta",
      "Britalia"
    ],
    "Barrios Unidos (Localidad 12)": [
      "Siete de Agosto",
      "La Castellana",
      "El Polo",
      "Alcázares",
      "Doce de Octubre",
      "Rionegro",
      "San Fernando",
      "Metrópolis",
      "Benjamín Herrera"
    ],
    "Teusaquillo (Localidad 13)": [
      "Palermo",
      "Galerías",
      "La Esmeralda",
      "Ciudad Salitre Oriental",
      "Quinta Paredes",
      "Nicolás de Federmán",
      "La Soledad",
      "Pablo VI",
      "Armenia",
      "El Recuerdo"
    ],
    "Los Mártires (Localidad 14)": [
      "La Sabana",
      "Santa Isabel",
      "Ricaurte",
      "El Listón",
      "La Pepita",
      "Paloquemao",
      "Voto Nacional",
      "San Victorino",
      "La Favorita"
    ],
    "Antonio Nariño (Localidad 15)": [
      "Restrepo",
      "Ciudad Jardín",
      "Santander",
      "San Antonio",
      "Policarpa",
      "La Fragua",
      "Caracas",
      "La Hortúa"
    ],
    "Puente Aranda (Localidad 16)": [
      "Ciudad Montes",
      "Muzú",
      "Alquería",
      "Milenta",
      "Salazar Gómez",
      "Pensilvania",
      "San Rafael",
      "El Remanso",
      "Galán",
      "Primavera"
    ],
    "La Candelaria (Localidad 17)": [
      "La Concordia",
      "La Catedral",
      "Las Aguas",
      "Egipto Centro",
      "Belén",
      "Santa Bárbara Centro",
      "Centro Administrativo"
    ],
    "Rafael Uribe Uribe (Localidad 18)": [
      "Quiroga",
      "Olaya",
      "San José",
      "Marco Fidel Suárez",
      "Diana Turbay",
      "Molinos",
      "Claret",
      "Gustavo Restrepo",
      "El Inglés",
      "Granjas de San Pablo"
    ],
    "Ciudad Bolívar (Localidad 19)": [
      "El Lucero",
      "Jerusalén",
      "Ismael Perdomo",
      "San Francisco",
      "Arborizadora Alta",
      "Arborizadora Baja",
      "Meissen",
      "El Tesoro",
      "Sierra Morena",
      "Lucero Alto",
      "Candelaria La Nueva"
    ],
    "Sumapaz (Localidad 20)": [
      "San Juan",
      "Nazareth",
      "Betania",
      "La Unión",
      "Santa Rosa",
      "Las Auras",
      "El Istmo"
    ]
  },
  "Soacha": {
    "Comuna 1 - Compartir": [
      "Compartir",
      "Ciudad Latina",
      "Llanos de Soacha",
      "Quintanar de la Sabana",
      "Parque Campestre",
      "Tequendama",
      "Santa Ana"
    ],
    "Comuna 2 - Centro": [
      "Centro Soacha",
      "La Unión",
      "El Sol",
      "Praderas de Soacha",
      "Las Villas",
      "San Marcos",
      "El Nogal",
      "La Veredita"
    ],
    "Comuna 3 - La Despensa": [
      "La Despensa",
      "León XIII",
      "Ciudad Verde",
      "La Amistad",
      "Los Olivos",
      "El Danubio",
      "Santillana"
    ],
    "Comuna 4 - Cazucá": [
      "Altos de Cazucá",
      "Ciudadela Sucre",
      "Julio Rincón",
      "Luis Carlos Galán",
      "El Progreso",
      "Villa Mercedes",
      "Buenos Aires"
    ],
    "Comuna 5 - San Mateo": [
      "San Mateo",
      "Rincón de Santafé",
      "El Portal",
      "Casalinda",
      "Sumapaz",
      "Las Margaritas",
      "Unicentro"
    ],
    "Comuna 6 - San Humberto": [
      "San Humberto",
      "Cabañas de Soacha",
      "Chicó Sur",
      "La Florida",
      "El Bosque",
      "Santa Helena",
      "Hogares Soacha"
    ]
  }
};
