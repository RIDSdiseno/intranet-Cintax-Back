import {app} from './app'
import {env} from './config/env'
import "dotenv/config";


app.listen(env.PORT,'0.0.0.0',()=>{
    console.log(`API escuchando en http://localhost:${env.PORT}`);
});
