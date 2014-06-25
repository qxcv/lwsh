Todo List
=========

+ Fix the pomodoro timer so that it is synchronised across the entire room. Also
  add a mechanism for starting it at the end of breaks (I think I'll just go
  with an implicit chat-based command mechanism with command strings like "pomo
  for :32").
+ Fix the 'die' message so that it doesn't kick off duplicated clients.
+ Work on video streaming of some sort. I'm not 100% clear on how I'll do this,
  but I think it will be WebRTC/TURN based. I may need to implement a supernode
  architecture if there are lots of clients (since n^2/2 connections = hell).
