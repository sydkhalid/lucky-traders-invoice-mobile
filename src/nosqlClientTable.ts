export type ClientDocument = {
  id: string;
  name: string;
  address: string;
  gstin: string;
  phone: string;
  createdAt: string;
  createdBy: string;
  createdByRole: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByRole?: string;
};

export type ClientForm = Pick<ClientDocument, 'name' | 'address' | 'gstin' | 'phone'>;

export const seedClientDocuments: ClientDocument[] = [
  {
    id: 'client-hindustan-steels-cement',
    name: 'HINDUSTAN STEELS & CEMENT',
    address: '#No.5/6A2, DoorNo. 1094, Jambary, Kanji, Chengam, Tiruvannamalai, Tamilnadu - 606702',
    gstin: '33EYDPA4709P1ZB',
    phone: '+91 93454 66572',
    createdAt: '14-07-2026',
    createdBy: 'Seed User',
    createdByRole: 'system',
  },
  {
    id: 'client-new-hindustan-steels-hardwares',
    name: 'NEW HINDUSTAN STEELS AND HARDWARES',
    address: '#2/415, Road Street, Near Primary Health Centre, Veeralur, Kalasapakkam, Tiruvannamalai, Tamil Nadu - 606908',
    gstin: '33CGGPM7511L1Z9',
    phone: '+91 93456 06657',
    createdAt: '14-07-2026',
    createdBy: 'Seed User',
    createdByRole: 'system',
  },
  {
    id: 'client-kumutha-plastic-industries',
    name: 'KUMUTHA PLASTIC INDUSTRIES',
    address: '3/605D, RAJIVE GANDHI NAGAR, PALAYAMPUDUR(P.O), NALLAMPALLI(T.K), DHARMAPURI(D.T) TAMIL NADU, 636807',
    gstin: '33COGPK3609P1ZN',
    phone: '+91 9043411825',
    createdAt: '14-07-2026',
    createdBy: 'Seed User',
    createdByRole: 'system',
  },
  {
    id: 'client-three-star-steels-bottles',
    name: 'Three Star Steels And Bottles',
    address: '#Godown No- 19/30B, Manjalungal, Ongallur, Kalladipatta, Pattambi, Palakkad',
    gstin: '32AAOFT8015G1Z5',
    phone: '+91 9846786009',
    createdAt: '14-07-2026',
    createdBy: 'Seed User',
    createdByRole: 'system',
  },
  {
    id: 'client-afza-material-handling-storage-system',
    name: 'AFZA MATERIAL HANDLING AND STORAGE SYSTEM',
    address: '#156/3 Gangaleri Village, Rayakottai Road, Krishnagiri, Tamil Nadu - 635122',
    gstin: '33AGTPA0639E1ZQ',
    phone: '+91 9750957733',
    createdAt: '14-07-2026',
    createdBy: 'Seed User',
    createdByRole: 'system',
  },
  {
    id: 'client-raghul-m',
    name: 'RAGHUL M',
    address: '#5/4A1, Kaikukaran Kottai, Karimangalam, Salem Main Road, Karimangalam, Dharmapuri, Tamil Nadu, 635111',
    gstin: 'URP',
    phone: '+91 8754417143',
    createdAt: '14-07-2026',
    createdBy: 'Seed User',
    createdByRole: 'system',
  },
  {
    id: 'client-aaradhana-traders',
    name: 'AARADHANA TRADERS',
    address: '#1/239C Santhur X Road, Pochampalli, Kattagaram, Krishnagiri, Tamil Nadu-635206',
    gstin: '33CMJPV5578B1ZQ',
    phone: '+91 9715141819',
    createdAt: '14-07-2026',
    createdBy: 'Seed User',
    createdByRole: 'system',
  },
  {
    id: 'client-prince-mathiyalagan-tn29bu9878',
    name: 'Prince Mathiyalagan -TN29BU9878',
    address: 'Kambainallur main road, kasappatti (post) morappur, dharmapuri.-635305',
    gstin: 'URP',
    phone: '+919715127410',
    createdAt: '14-07-2026',
    createdBy: 'Seed User',
    createdByRole: 'system',
  },
  {
    id: 'client-muniyappan-sevathan-tn29bp7081',
    name: 'Muniyappan Sevathan - TN29BP7081',
    address: '#4/64, MOTTAIYAN KOTTAI, Dandukaranahalli, Dharmapuri, 636808 Dandukaranahalli, Tamil Nadu, 635808',
    gstin: 'URP',
    phone: '',
    createdAt: '14-07-2026',
    createdBy: 'Seed User',
    createdByRole: 'system',
  },
];
