Todo List
=========

+ Make sure the client sends an "alive" message (or otherwise registers with the
  server) as soon as technically feasible, rather than waiting for the first
  setInterval.
+ Implement a "die" message to remove clients from ActiveClients, and trigger
  said message when the window closes. This may require some hacking to address
  cases where multiple browser tabs are open to the study hall (I could fix this
  by adding a "disconfirm" hook to the client which the server could call when
  it receives "die", so that the client could inform the server if it is not
  exiting).
+ Add "User {joined, left} the room" messages.
+ Fix the pomodoro timer so that it is synchronised across the entire room. Also
  add a mechanism for starting it at the end of breaks (I think I'll just go
  with an implicit chat-based command mechanism with command strings like "pomo
  for :32").
+ Work on video streaming of some sort. I'm not 100% clear on how I'll do this,
  but I think it will be WebRTC/TURN based. I may need to implement a supernode
  architecture if there are lots of clients (since n^2/2 connections = hell).
