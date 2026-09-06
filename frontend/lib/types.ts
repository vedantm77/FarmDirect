export type MatchScore={overall:number;distance:number;price:number;quantity:number;quality:number;readiness:number;reliability:number};
export type Listing={id:string;farmer_name:string;crop:string;quantity_kg:number;quality_grade:string;asking_price:number;reliability:number};
export type Match={listing:Listing;distance_km:number;score:MatchScore};
export type Demand={crop:string;quantity_kg:number;quality_requirement:string;max_price:number;delivery_date:string;location:string;latitude:number;longitude:number;radius_km:number};
