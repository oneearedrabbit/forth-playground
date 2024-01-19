# forth-playground

Forth experiments.

forth00.js -- bootstrapping Forth. VARIABLE, ARRAY, CREATE/DOES>, IF, BEGIN, AGAIN, VALUE/DEFER, and stuff. Butchered, Ruby-like syntax:
```
DEF COUNTER
  CREATE ,
  RETURN DUP 1 SWAP +! @
END
0 COUNTER AUTOPK
AUTOPK PUTS  # => 1
AUTOPK PUTS  # => 2
```
