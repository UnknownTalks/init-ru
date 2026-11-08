// One constrained transmission drives the drawer and every wheel. Progress is
// dimensionless; frame rate changes cannot alter the gear ratios or the stop.
export function createMenuDrive(){return {position:0,velocity:0,target:0,accumulator:0};}
export function stepMenuDrive(s,dt,rate=1){
 s.accumulator+=Math.min(.064,Math.max(0,dt))*rate;
 while(s.accumulator>=1/240){
  const h=1/240,force=110*(s.target-s.position)-22*s.velocity;
  s.velocity=Math.max(-1.65,Math.min(1.65,s.velocity+force*h));
  s.position+=s.velocity*h;
  if(s.position<=0){s.position=0;s.velocity=Math.max(0,s.velocity);}
  if(s.position>=1){s.position=1;s.velocity=Math.min(0,s.velocity);}
  s.accumulator-=h;
 }
 if(Math.abs(s.target-s.position)<.001&&Math.abs(s.velocity)<.008){s.position=s.target;s.velocity=0;}
 return s.position!==s.target||s.velocity!==0;
}
