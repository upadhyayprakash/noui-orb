#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime,uFlowT,uWave,uAmp,uBright,uBass,uTreble,uSat,uEnergy,uGrain,uScale,uWaveAmt;
uniform vec2 uLean;
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){
 const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
 vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);
 vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);
 vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
 i=mod289(i);
 vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
 float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;
 vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
 vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);
 vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
 vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));
 vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
 vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
 vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
 p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
 vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
 return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){float s=0.;float a=.5;for(int i=0;i<2;i++){s+=a*snoise(p);p=p*1.9+vec3(1.7,-1.3,.9);a*=.45;}return s;}
float hash(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
void main(){
 float mm=.5*min(uRes.x,uRes.y);
 vec2 p=(gl_FragCoord.xy-.5*uRes)/mm;
 float r=length(p);
 float ang=atan(p.y,p.x);vec2 cs=vec2(cos(ang),sin(ang));
 float wob=snoise(vec3(cs*1.3,uTime*.5))*(.006+.03*uAmp)
   +snoise(vec3(cs*3.5,uTime*1.4))*.018*uTreble
   +snoise(vec3(cs*.9,uTime*.35))*.02*uBass;
 float R=.78*uScale*(1.+wob);
 float aa=1.6/mm;
 float mask=1.-smoothstep(R-aa,R+aa,r);
 if(mask<=0.){gl_FragColor=vec4(0.);return;}
 vec2 q=p/R;float q2=min(dot(q,q),1.);float z=sqrt(1.-q2);vec3 n=vec3(q,z);
 float t=uFlowT;
 vec3 sp=vec3(q-uLean*.22,z)*.62+vec3(0.,0.,t*.2);
 vec3 w=vec3(fbm(sp*.8+vec3(0.,t*.15,3.1)),fbm(sp*.8+vec3(5.2,1.3,-t*.12)),0.);
 float field=1.25*fbm(sp+1.1*w);
 field+=.3*sin(dot(q,vec2(.72,-.69))*2.2+w.x*2.+t*.4);
 float rq=length(q);
 field+=sin(rq*8.-uWave)*(.03+.28*uAmp)*uWaveAmt*(1.-smoothstep(.2,1.,rq));
 field+=snoise(n*5.5+vec3(0.,0.,uTime*1.6))*.16*uTreble;
 field+=uBass*.25*snoise(n*1.3+vec3(t*.5));
 vec2 dl=q-uLean*.45;
 float b=.5+.55*field+(uBright-.5)*.35+uEnergy*.18+.22*length(uLean)*exp(-4.*dot(dl,dl));
 vec3 cDeep=vec3(.95,.36,.15);vec3 cMid=vec3(1.,.54,.27);vec3 cLight=vec3(1.,.68,.38);vec3 cPale=vec3(1.,.84,.52);
 vec3 col=mix(cDeep,cMid,smoothstep(.05,.48,b));
 col=mix(col,cLight,smoothstep(.4,.78,b));
 col=mix(col,cPale,smoothstep(.72,1.05,b));
 vec3 L=normalize(vec3(-.4+uLean.x*.7,.5+uLean.y*.7,.8));
 float diff=dot(n,L)*.5+.5;
 col*=.86+.2*diff;
 col*=1.-.12*pow(1.-z,2.);
 col+=vec3(1.,.95,.85)*pow(max(dot(reflect(-L,n),vec3(0.,0.,1.)),0.),18.)*.1;
 float gray=dot(col,vec3(.299,.587,.114));
 col=mix(vec3(gray),col,uSat);
 float hh=hash(floor(gl_FragCoord.xy)+floor(uTime*14.)*vec2(17.,31.));
 col+=(hh-.5)*uGrain;
 gl_FragColor=vec4(clamp(col,0.,1.)*mask,mask);
}
