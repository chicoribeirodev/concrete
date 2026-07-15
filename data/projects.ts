export type Coordinates = {
  lat: number;
  lng: number;
};

export type Project = {
  id: string;
  name: string;
  status: "Draft" | "Active" | "Archived";
  updatedAt: string;
  center: Coordinates;
};

export const projects: Project[] = [
  {
    id: "1",
    name: "Riverside Development",
    status: "Active",
    updatedAt: "2026-07-10",
    center: { lat: 38.7223, lng: -9.1393 }, // Lisbon
  },
  {
    id: "2",
    name: "Harbor District Rezoning",
    status: "Draft",
    updatedAt: "2026-07-08",
    center: { lat: 41.1579, lng: -8.6291 }, // Porto
  },
  {
    id: "3",
    name: "Greenfield Site Survey",
    status: "Archived",
    updatedAt: "2026-06-22",
    center: { lat: 40.2033, lng: -8.4103 }, // Coimbra
  },
  {
    id: "4",
    name: "Douro Valley Vineyard Expansion",
    status: "Active",
    updatedAt: "2026-07-05",
    center: { lat: 41.1621, lng: -7.7869 }, // Peso da Régua
  },
  {
    id: "5",
    name: "Algarve Coastal Resort",
    status: "Draft",
    updatedAt: "2026-07-01",
    center: { lat: 37.0194, lng: -7.9304 }, // Faro
  },
  {
    id: "6",
    name: "Alentejo Solar Farm",
    status: "Active",
    updatedAt: "2026-06-28",
    center: { lat: 38.5667, lng: -7.9 }, // Évora
  },
  {
    id: "7",
    name: "Braga Urban Renewal",
    status: "Draft",
    updatedAt: "2026-06-19",
    center: { lat: 41.5518, lng: -8.4229 }, // Braga
  },
  {
    id: "8",
    name: "Serra da Estrela Ski Lodge",
    status: "Archived",
    updatedAt: "2026-05-30",
    center: { lat: 40.3306, lng: -7.6106 }, // Serra da Estrela
  },
  {
    id: "9",
    name: "Aveiro Canal Front Housing",
    status: "Active",
    updatedAt: "2026-07-12",
    center: { lat: 40.6443, lng: -8.6455 }, // Aveiro
  },
  {
    id: "10",
    name: "Setúbal Port Logistics Hub",
    status: "Active",
    updatedAt: "2026-07-13",
    center: { lat: 38.5244, lng: -8.8882 }, // Setúbal
  },
  {
    id: "11",
    name: "Leiria Industrial Park",
    status: "Draft",
    updatedAt: "2026-06-15",
    center: { lat: 39.7436, lng: -8.8071 }, // Leiria
  },
  {
    id: "12",
    name: "Viseu City Centre Retrofit",
    status: "Archived",
    updatedAt: "2026-05-20",
    center: { lat: 40.6566, lng: -7.9122 }, // Viseu
  },
  {
    id: "13",
    name: "Viana do Castelo Wind Farm",
    status: "Active",
    updatedAt: "2026-07-02",
    center: { lat: 41.6932, lng: -8.8329 }, // Viana do Castelo
  },
  {
    id: "14",
    name: "Castelo Branco Agro-Innovation Center",
    status: "Draft",
    updatedAt: "2026-06-10",
    center: { lat: 39.8222, lng: -7.4909 }, // Castelo Branco
  },
];
