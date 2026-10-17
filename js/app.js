(() => {
  'use strict';

  const cfg = window.CONYWHOOK_CONFIG || {};
  if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR-PROJECT')) {
    document.getElementById('app').innerHTML =
      '<div class="panel empty"><h1>Не настроено</h1><p>Заполните js/config.js: SUPABASE_URL и SUPABASE_ANON_KEY.</p></div>';
    return;
  }
  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

  const ROLE_NAMES = { owner: 'Владелец', admin: 'Администратор', helper: 'Помощник', user: 'Участник' };
  const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
  const state = { me: null, flashes: [] };

  // ---------- утилиты ----------
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (v) => (v ? new Date(v).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const $app = () => document.getElementById('app');
  const isStaff = () => !!state.me && !state.me.banned && (state.me.role === 'owner' || state.me.role === 'admin');
  const isSupport = () => !!state.me && !state.me.banned && ['owner', 'admin'].includes(state.me.role);
  const isOwner = () => !!state.me && state.me.role === 'owner';
  const emailFor = (name) => `${name.toLowerCase()}@conywhook.local`;
  const roleTag = (r) => `<span class="role role-${esc(r)}">${esc(ROLE_NAMES[r] || r)}</span>`;
  const safeNext = (n) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/');
  const DEFAULT_AVATAR = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAQDAwMDAgQDAwMEBAQFBgoGBgUFBgwICQcKDgwPDg4MDQ0PERYTDxAVEQ0NExoTFRcYGRkZDxIbHRsYHRYYGRj/2wBDAQQEBAYFBgsGBgsYEA0QGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBj/wAARCAEAAQADASIAAhEBAxEB/8QAHQAAAQQDAQEAAAAAAAAAAAAAAQACAwgEBQcGCf/EAEwQAAECBQIDBQQFBwkFCQAAAAECAwAEBQYRByEIEjETIkFRYRQycYFCUmKRoRUjgpKiscEJFhckQ4OywtEzY3JzkxglU4SztOHw8f/EABgBAQEBAQEAAAAAAAAAAAAAAAABAgME/8QAJBEBAAMAAgIBBQADAAAAAAAAAAECESExAxJBEyIyUXFCUmH/2gAMAwEAAhEDEQA/AKBwRCAGIMAoUKEPWAUHEGEBALEICHQQIBuIIG8OCSYlQ0T4QEODmHBvMZjcqpXQGMtmmOLUkcu52A84DVBow4MKPhHWrX0D1Tu5tDtCsSsvsK6TDrHs7Xx53OUYjrFC4G9V59tLtUmrepCD1Ds0qYUn4hpBH7UaisyKoCWV5GF7MryMXVHBZblJTm6taqFIEe8lLLbePm68P3QDw08PEr3Z7iKpwWOvLMSQ/wA5i+kilnsyvKB7OfKLpjhq4d5nuSfEZTSs9OaYkj/nEE8F9r1VObW1voM+o+6lTTTmf+k8f3RPSRSksEQ0tEeEW0rvA5qpT21O0mct+so8OzmVy6j8A6kD9qOTXVoLqlaDS3q9YtZl2EdZlpj2hr9dvmH3wmswORFGIaQY3DtNWkqHLnGx9Iw3JZSc7GMjCxAI2idTRERlOICPEDEOxAxAMIgGHkQCIBsLEGBAKBBgQDoUIQoBCDiFBA3zAECCBCxvD0pJgAlOYlS0TEjTBUQAI9Db9s1a4a1LUijU2ZqE/Mr5GZaWbLjjh8gB+/w8YDSMSilkd0x7mxdK7z1Aq/5PtK3ZyqOJP51xpGGmR5uOKwlHzMWWtHhlsnTa12734iLklKdLJ3borT576uoQtaO86v8A3bXzVGnv7jImJOkfzU0QtuUtKiMjkbnXJdHbkdMtsjKGvirnV8DG/XOxuKRwmWRYNGauDXfUin0iXxzewSTwb5/s9qscyz6NoPxiR/iO4e9LEqldINK01acbHKmqTzYYCj59o4FvK+5MVArly1q4627V6/Vp2qT7pyuanXlPOK/SUSceg2jUqdJPWHtnQsbdXGjrXcC1pp1Up1usHZKKZKJU4B/zXedX3YjkFf1Mv653FLuG9rgqZV1EzUHVJ/V5uX8I8aVmAVesZmZnsZK3gtXMtKVHzUMn74b2+BgAD5Rjc28LmiDJ7bPUA/EQUOpQoKShKVDxAAMYgMOCoD2dB1Lvy2HUrt69K/TCnoJWfdSn9Xmx+EdjtLjR1mt5SG6nUKbckuNiipywQ6of81rlV94MVq5vWHJWYsWmOhd6W4geG/VlIldWtNE0CoO901SVb7VIPn2zIS6n9JKhGJcXCFbt20NdyaG3/TrgkSOYSc1MIXj7IfRsD6OJSfWKYIeKTsY9BbF5XHZ9ebrNr1yfpFQR0mJJ4tqPorGyh6KBEa9t7GxvLTm6rHri6TdNBnaVNjOG5lvlDg80KHdWPVJIjxr0spB3Bi5Fl8XNBvChpsziDtWSrNMd7v5WlpYKKD053GB0P22iD9mMbUnhQk6pbQvvQutN3TQX0l1Mgh4OvJHU9i4P9rj6isOD7Rh670KbKQREZEbuo0uYk5lxiYYW062ooW24kpUhQ2IIO4I8jGrW2UncRgY+MQ0xIRDTAMI2xAhxENgBAgmFAGCBmEIMAsQ4CEIclOYApSSYy2GCtQAENYZKlDaO36D6D1vV26uRBckaBJrT+UKnyZ5M7hpsHZTpHQdEjc7YBsRvEDUaRaK3Zqxc/wCTLflQ3KslJnKlMJIYlUn6xHvKPggbn0G8WVuDUPSfhUoMxaOm8jL3Lfq0dnPVKYwpLCvEPLT0weku2Rj6Zz181rJxB0GwLWVo5oH2VOp8oFMT1blVZUpXRaWHOqlk++/1J2TjrFP35hTiyoqJJOSSckkxqZivXY9Le+oF16gXM5X7urczVJ9fdC3jhLSfqNoHdQkeSQPnHlVuk+MMKiesR5zGA4qhud4BO8NzAOJgZgEwMwBMDMDJzAMA7MLMNhZgH52ghUM6QcwEiVbw8LiEGHAwGUh0g9Y6Fpfq/eulFxiq2pVC204oGap7+Vys2B4ON56+ShhQ8DHNAYmQvEInBfGYp+k3F/bT9To6mLU1KlmOd+XcIJfwOq8Adu14doBzo+kCNjTq+rCuKxLtmrduamOyFQlz3m17pWk9FoUNlIPgobH45Eaqh1yqUGuSlZotQmafUJRwOy81LLKHGljoUkf/AIeh2i6Vq3jZfFpp4LFv0StI1BkGVLkKk0gDt8DJcaT4g4y4z+knpt04t/RRBxspPSIVDEe81DsCv6fXpOWzcckZadlldRuh1B91xtX0kKG4PyOCCI8Q4jBjnMDHMNMSEQwiAbAgmBAOEOHWBBEA4DMZLLXMRiIW05MegoFGnqzWpSl02VcmpyadSwww2MqcWo4SkfEmA9zo1pNWtVdQpe3qWCywkB6enSnKZVgHBUfNR6JT4n0Bju3EFrFRNPbPGgmjyhIyUm2ZesVCXX3yo++wlY6rUd3V9d+QY3xv72rVO4UeHeVsa2plleoNwt9tNz7WCqXGOVTw9E7ttDz5l+BikD763XVKWpSlKJJUo5JJ6knxPrHSftjPlDHHMnyA8ohKt4RMNJjmpFUNzCyMQCdoBGBmF4wDAIws7Qh0h6UE+EBHCwYy25ZSlAAbqOAPM+Qj29F0Y1UuGWExQ9OLqn2VDIdZpb3IR6KKQDAc8wYOMR0Ks6M6qW/Kqma1pvdUiyn3nXqW9yD9IJIjwzkupKlAjdJwR5HyMBjQocUkGABvAEQcxtZOil5hL0w92SVbhON8fOM9FLpDZwXEuH7bo/hFwech6Tjxj0vsskB+bZYOPLBhi2WwMdkj4coiDRoVGypVUnqTVpap02cfk5yVdS8xMMLKFtLScpUkjoQYkclGFD/ZJz6DEYrkqUDmbOQPDxgLrSc/Q+LnQxdPqHskjqXb7XM27gIS+D9If7lw4Ch/ZrwRsd6XV6iz1FrU1S6lKOys5LOqZfYdGFNrScFJHmDG5sW963YN9U+6rfmA1PSa+YJV7jqDsttY8UKGQR8+oEWR4gLToeqOk9O19sRjPaMpRWpcbrRjCeZYH021dxR8U8qugjp+cb8wKcrTgxEYzZhooWQRGIobxzER6wDDiIBgHAbQ5IhoiVsZVAZMu1zKAxFv+Fey6Nalq1vXy9R2VKojLqKfzDdSwMOOJz1VuGkfaWryistkWxUbsvKl25Sm+edqMyiVZGMgFRxzH0AyT6AxZni0umm2dZlsaBWm4G6fTJVqbqHIcFZAPYpV6k87yvVSI3Tj7pFcNR78rOo2otUu6uL/AK1PO8yWgcpl2hs20n7KU4H3nxjxxOTD1q5jEXjGAjDCYJMNMAswMwiYEAswoBgiAkQnJjr2hmg10623cun0gpkKRJlJqNYfQVNyyT0SkfTdUAcIB9SQI5rb9Gn7guOQoVKYL8/PzDcrLtD6bi1BKR8MkfKPr7plYdF0p0spdk0RCS3KN80xM8oCpuYVjtXlHxKldPJISPCLEaNfphoBpbpNItfzct1iZqqUgOVmpJS/NuHxIURhsfZQEj4x1AzRUMLWpXoTmNWZjyMNMz6xvFxtRNFJ7qyn0BxHLdUNBNLdWpF03JbrMtVFJIarNOSlibbPgSoDDg+ysEfCPde0b9Yd7TnqYYPk7rjoTdOid4pp1YKZ+kzZUqm1hhBS1NJHVJH0HU5HMgn1BI3jkxGDiPsZqhYNG1W0rqlk1pKQmbRzSsyU5VKTKQeyeT6pPXzSVDxj5CV2kT9AuKfodVlzLz8hMOSsw0foOIUUqH3gxiYxGtJz1JPxgYHkIRgZiA9FZG3wjMlajMS6xzKLiPFKjn7jGFBzAerSEraS6k5CxkH0hpSPeG2IjkUqTSGebOeXPwEOPXzzAamY/NTakjbxiw3CpqZL0G95jTu41Idt25h7P2T5y2iZKeVOc9EuJPZn15PKK5zTvaTa1Dzx90GWfcZfQ606ptxCgpC0HBSQcgj1B3jVbes6Oia1aczGm2q9StwpWZMK9okXVDdyXXkoz6jdJ9UmOYrTgxcjVMt63cH9C1VYbSuu0EGXqgQN8ZCHs+nN2bo9Fqin0wgpcIIi3rk8dDCUIYYkUIYYwHCMhhGVCMdI3jYSbfM6BAWw4NLWkWrluHU2uAN0225FQQ6rolxaFKWoeqWkq/XEV01Au+evrUatXdUVH2ipza5kpP8AZpJwhA9EoCU/KLS1k/0WfyZ8nJI/M1O9HwXMbKLbx51fcw0gfpxTR5WVkx0txEQiJR2hmYcTEZjmpEwPCEfOBALpA8IMLEA2HJEZLUg84OdY7NPmrr90B5tDBCU7nzMB3fg/o7NV4rqC9MICkU1iZqIB+uhopQfkpYPyj6XLmD5x83eDOebleJxhCyAp+kTjSB5nlQr9yTH0J9sxtmOlehtjM+Gd4BmO71+UahUx3esNE0N8qxGhtjMZOMwRMYG+8aVU338D7oXtZVtmA3qJrPQ7eMfNDjAozFJ4r6+9LoCG6kxLVEgeK3GglZ+akE/OPosiaGcEx89eM2eRN8Tr6EKBLFJk2lAeB5Vq/coRm3QrwTDYR6wsxzBjJkpVU3NpbGeXqo+QjHbQpxwIQkqUTgAeMepkJNMlLYIBcVus+vl8IYJVJ7mE7ADAx4Rgzz/s0uVA987J+PnGa84hptTi1AJAyTHmpuaVNTBWQQkbJT5CAhyYeknO0RiHpgLS8H1yys1XLk0urJDlNuCRW6hpXTnQkocA9VNKJ/uxHAL2tyatS96tbk6D29Om3JVRI97lUQFfMYPzjN0wuhdm6t27cyVlKZGfacdx4tE8rg+aFKjsfGJbCKVrUzXpdI9nrUih/nHRTjf5tR+aQ2fnHSeafxFZliITGQ6O9ECo5qegbx6G3KY7Vq5J0thJLs2+3LIA+stQSPxMefQO9HYuHKkprHEtZUktHMgVNt9Y9GgXf8kWI2R2PjeqbVOrNkafSSuWVo9LU+Wx0BUQyj9hk/fFQ1ncx3ni8rCqrxV3C3zcyZBmWkU+nIylR/aWqOBqO8avO2DYaYJMMjARMKB4xtJKmcwDs0CB1CPE/GAxZWRfm1fm04RnBWroP9Y27MjLyieYYUsdVr8P9IyHHmpVjmUQhCdgB/ARoJ2fdmlco7rQ6J8/jFGROVEZKJffwKz/AAjWcxUrmUST5mATCiDoOi92N2Vrva9xzDnJLMTyW5lXky4C0s/ILJ+UfTxUyEOEFXjjOesfIVKvA9DsYv8A8Pmqjd+6Uy8hPzKTXaK2iUm0qPeebAw0965SOUn6yT5iN0/Q7w5NnI5VbxjqmVdSflmNKqcIPXeF7UOXciOuI3HtvgDBE53feOY8+qb8Bn5Q9E2VJ2J284YPSNzXMQCv0yTgD1j5i6yXai99dLnuVhfPLTM8tEurOcstgNtkfFKAfnFvOITVFFjaWzFNkZoJrlZbXKyqUK7zTZGHXvTAPKPtKHkYoOojoOgjlefhQMFKVLWEISVKOwA8Yc00t5wIbTlRjdyUoiUHNnmcI3V5egjEQJKfIok0hxzCnj8+X0EZ63kNtKWtQSkDJJ6RiOzDbTRW4oJEaOdnXJtePdbHRP8ArF6Es/UFTjgSnIaSdh5nzMYXjDYMQEdYkTiIxEiYDIYAJ5T0IxFuNdVC9ODfTa+z35iXQ3LPr8craLas/psD74qMz7wi29uA3D/JmVyWV310aecWnO/KETDbo/B1UdPHzEwiob6cOERiqjOmk4dV8YwlRzVI17wix3BzJCb4o6Oopz7PJTj49CGSkf44rgz74i0fBNy/9pdknqKTN4/YjVPygcv1+nTP8S99zJOc1uZQD6JVyD/DHMVR7vWAqVrxehPX8uzv/rrjwajEnsMMN67CCd4z5GWAT27g3+iP4xBNJSQaAeeGV+CT9H/5jMceQyyXVqwkfjDObAjUTkyX3sJP5tJ7vr6xQ2amnJp7nXsB7qR0EY+YMNiBQRuIQESJRkZOwgGAGPSWTedbsG8ZW5qE8ETEvkLaXuh9s+82seKSB8jgjcR6iytEL9vVtublqYKbTV7ifqWWkKHmhOOZfyGPWLBWXw72Raj8vUq087cFSaUFp9oT2cshQ6ENDPN+kT8I1WsyOzylTM7S5WoKZWwZhlDxZX7zfMkK5T6jOPlD1TZAyDGtfmwrJz8YwVzmVbqxj1j0RCS36JxQIVnIiOoVgyFGm51LSnUy7C3i2j3l8qSrlHqcYjR+2FIPe38RErc8OUKzFwUFvS8a3fl3zNyV14LmZjAQ2jZDLY91tA8EjPzOSdzGgba514JwPOLg3nw/WXdUw/UqM49QKi8orV2CQuWWo9SWjjl/RI+EcCvPRe+rLQ5NTVNFQpyNzP07LqEjzWnHMj5jHrHntSYV45gtso5WxjzPifjBdn22UY95f1R/GNaXFhPdVsfERB4xjRM8+5MOc7is+Q8BEcAQYBQRAgiAI6xImGCJEwEzWygYtzoL/wB48E2rVMVuG0POAeWZUK/e3FRm+sW94ZU54WtXyod32Zf/ALJ2Ovj7FRJ0fnSfONeqNlOjvfKNcsxyDmj3ospwaTaZfiepqFKx21PnGh6nsub/ACxWts96O18M9UTSuJyzZha+VDs97Ko+jqFN/vUI1TuBoddZRUlxG31LqTjlrk0fkpwqH+KObKjuvFlSlUviruglHKmcLE8n17RhGT+slUcKV1iW7kJhrtZhKD06n4RtyrlGwAx0Ea6QID6yfq/xjOOVRBFNuFMmojqe798aqNu632rBbzjPSNY4w62cLQQPPwgI4AEHEOSneA2lu27V7ouOVodDklzc9Mq5W2k7epUT0SkDck7ARcLTfQq1bFYZqVZaZr1dACi+8jLEsryaQeuPrq38gmNTw8WTK21pwm6ZtoCrVlHOlahu1LZ7iB5c2Oc/o+UdXcnhhQzv5x2pT5lGfMz5VnfJ8TGsenSFHB6RhPTYBxzbnxjWvTClKPex6iOg2Lk8FHl8YxHJrG528o1y30k75xEDr3jnOYqNmZsjbO8JM6QoAHIjTLfI2B3gJmSnbO8UenbncLB5ukZzVQGcZx6x49E15K+MZTc75nIgPMahaJWvess9UKOhiiVs5UH2UYYmFeTqBsCfrJ38wYqXXaHVLcr8zRqzJrlZ2WVyuNK/Ag+KSNwRsRF6GJ47b7eUcx16tFi47DNxyrKfylSE86lgd52Xz30nz5c8w8u95xz8njiY2FhVPeDCIwYUedRhCBDgIByYenrDAIkT1gJkDvCLg6AINO4GdW6srYOh9sHzxKJT+9yKgspyoRcegN/zY/ksqtMr7jtdnnEp8OYLmUNj9llUdKdinE+cPEeW0a1UbCeOXlH1jXqEcwUHePU2hWHaFdVNrTKiHJGaamkkebawv+EeVQd42UisBwZ6QFruOOjtuX9at6ygCpasUktdonoS2vnT+w8n7oqOsbxdG+EjVH+TgoFxt/n6laTyG5gjdQQ2ewcz/drZX8opk8nCyI35O9ELThadC+vp5xnoeQ4MoIPpGuPWG+O0YG0CjnaH5z1jVB1wdHFffC7Z4jdxf3wGxdVhPQYiCUllVCrS0igjmmHkMj9JQT/GMPvE5JJ+MTyk0/Iz7E7Kr5H2HEutqwDyqSQQcH1AgL/JcYkZJqQl+VLMu2llAA2CUgJA+4Rr3p0HICgDFZJHiAvRnAqMrTKgnxJaLKj80nH4RvZfiClXSPyhbky0fFUvMJWPuUBHojyVTHcFzBJIiEzA33xHLJbW6z3h+eVUZYn/AMSW5sfNJMZ7eq1jvHavtt+jjTif8sX2j9j3y3gBgxjLeAUckR5NOotnLT3blpxJ83cfvEBV7WuRzC46Yf8AzCf9YuwPSreCVZiP2ghWebrHlnL2toHJuKm/KYT/AKxjPX7ajQ3uKQP/AAuc37obA9n7RjfMPbnAnbIjnruplntp3rSV+jbS1f5YwJjV21Gf9kZ+YP2GOXP6xET2j9jrjc94E7Rll5ielHZJ8pU0+2plYPilQKT+BjgU1rdLpBEjQn1+r74SPuAMaWa1suxzIkWKfJDwIbLqh81HH4Q+rWDHPJyXVKTz8orqy4po/okj+EQRLMzDs3OOzT6+d11anFqxjKick/eYixHmUh1h4MNxBHWAeIkT1hiYkQMmAypcHmyBkgZx5xcziPSLF4QdL9NtkTCmm5iYQOuWmcqz/ePn7orrodZpvrXq17bU3zy706h6a8gw1+ccJ9OVBHzjqPGbeCa/xAv0hhwGXoUo3IhKegdV+dd+4rSn9GOkcVmRWKZVlwmMNUZDysqMY6o5hDrGVLr5VgxiCJW1YIgLh8Htx06qpuvSWvqC6fcEkt5ptXioILbqR6ltQV/dxWS9bXqFm31VrWqiCmcpk05Kukj3uU4Ch6KGFD4xnafXdULKv6kXTSz/AFqmzKJhCc7LAPeQfRSSpPzixHF7Z9OrslbuuFqp7ek1yVaYnHUDo5y5ZWryJQC2ftNgeMdO6/wVEUIYREzicHERERzDRB5cHcgfExlU6T9uq0rJc/Z+0PoZ58Z5eZQTnHpnMX01VuPRrhmbt+zKfonRblemZNT7k3OIZ7RQQvs+dbjja1LWpQUT0A2x5CxAoFgE4BST6HMIgA4Kkg+RMWwb1I064gr4tLS+V0cpFms1CtsLmqlTlNB5TCErUtpJQygjnG2c7eUe71S1j0j0a1Lf07pfD5bdTbprDPPMLaYaHM42FgDmZWpWAoZUo5JzDBRXl2zkY8/CBgYBKk4PQkx9D5jT7Su6rr0Y1Zt6x6ZSmq9PBqdpJlW/Z5ht2TfcHatAchWhbZHMAMgjPQR5fVDWbRjSHV2sWZI6AUGrOtKbdnptbcu0lTi2kq5W0qaXhISUjbAznbxLBRggcvNkY84GfI/dH0Wqum2lVU1j0c1Do1lUqRlbi7dM3SvZG/Z3kLp632lOM45OdJGCQN9vIGKgcStLp9I4qL2p1JkJWRkmZxIalpRpLTbYLDZwlKQABkk7ecJjByjI+sPvgEZGdsecfQK4W9OrE090AuGq2RbXsdRcl5KrFymMK7dt+QSkuOkp7xStSXMnfIPnGvltArdpPHzcVeq1GkE2LTKWq5fZ1y6TJpUtKkdkUY5ShC0Pr5cYwgQ9RQ0DbIxjzEdj0k0CqGq+m133hJ3PJUtq22y4th+XW6ZjDK3cJUkgJ2bI384sRWNCLZuTjfsq57bpEiqxK5TkXCtiXl0plVdghOWw2ByhLhXLkpx9NW3WOh6W3RZtTrOuc5S6HTpa1aa+iQMhTJZDDcwyxKPJeUEoABLhDm/kU77RcHzSBCgDzDcdMweU+O2IvFpfrjoxqbqVStOV8O9uUyWqZVLyz3YyzwThtSkhaQyk4ISRkKyPWN/a+jWkem9wav35VbWZr0lbD/aU6mTaQ83LM+yNzKkJSvKVKy6EBS88qU+eTEwfP4AHYKST5AwuXYk7D1i9WmOtWkGsGpUpp3UuHq3KY3VW3UiYS0w73kNqXg8rKFJBCSOZKsg4jZ2rpJpTozbuq+odetOXulu3qs/L02Vnkpf7CXShlSGwFgp5yqYCS4oE8qR65YKBAJJwFJJ9DHYJDQOoT3CbP65IuWTRKSbymVUoyyy6opfQzntM8o3Xnp4RZLSnVfR7XPUA6dVbh9tukpm5N91Ew22w5ktp5iMoaQpB5c4UDkECPXUXSRdV4Pbv0XtyoIaAuedp7E3OEnkabn218ygN1KCE9B7x8sxYgfN9QCepA+JxCEXA1squm/D/AGa3o/YtkU+p3Q7Lh+fuau0xt91sOD32S4kgrI6cvcbxgZVnFQOpMSYDk9YnaTlUQoGY3tu0SoXBcUhRKTLKmJ+emES0u0nqtxaglI+87+mYgtlweUCRtCyr01yuBsJk6XKOScqVD3gkBx4p+JDTY9VERVO7q9O3DdFRrdRcK5ufmXJp9R+utRUfxOIt1xK1Wm6TcPtqaCW9MpU8WETVTdRsXEJUTlX/ADHudfwQIpRNO8zhMbtxwMVZyqIVQ9R3iNUYCEPScGGCHQGdLOlCwQYuFwz3TRtQtM67w/Xm9mVnWHHqWtW6kfSWhH2kLAeT8FiKaIVgx6O2LgqNu3FI1ukTa5WfknkzEu+jqhaTkH19R4gkRqtskZN9WdV7GvyqWpXGeSep7xZWQO64OqXE+aVJIUD5GPLqGIu1qhb9M4lNBJLVOzZNAu+jslmpU5ndbqUjmWyB1JTkuNnxSVJ69KVvN8p9It65PAhadcYfQ8ysocbUFpWOqSDkH7xFtZniz03va36cnVrRaXuGsSbfJ7SlbS2ySBzKQFgKQFEZKckZipJBhsZicFibp110rl00ar6T6Qy9pXLSqqxUGagQ0UrQgK52VBG5SrmAPpHsa3xPaGXnPIrN76BipVkspbcmHHWHfd6JCyEqKR4ZGcbRUWFmGi1Fe4u5Oqak2PM02y3aTaFqzSppNMl3kds+rsFsoAwAhtKErICRnqd+kcR1jv2U1N1orV7SFOfp8vUOy5JZ9aVrRyMobOSnY5Kc/OPDHeBDRZeq8VLSbR0xlLatqZZqVlvMuOLnnkKZm0plTLrQAjvJCgpW/gD5xYGtI/nlP/l+5OD6ZqtVcZRzTMzO05ZXhPdBWVgqAGBkjOPDwj50A4ORHR08QGtSUBCdT7kCQAABNdMfKLEiy/G5UM6MWBIT8vLyFScmlvKp7CwpLATLBK0oIAylClBIIGNto8Dd/F25c3DMrT9FDn2bimqczTZ6rKeR2TiE4DqkpA5srSnG/wBdUV0uO6rku6smrXRXqhWJ4p5PaJ59TqgnwSM9B6DAjTxJkWi084uXLI4dEWI7Qp6br0jKzEnTakl5AaZQvJa5kkcx5Co9OoSnyjx+i+u1J0w0vve2KjQqjUpq4myhp9l5CUtEy7jWVhW53WDt5Rw2FDZHtNJL1lNOtZrdvSfkZiel6U+XVy8usIW4C2pGAVbDdQO/lHfKXxhyMjqreVQnbIeqVpXP2C3qZMvtl5laJZLCzkgoWhaU4KT5Dfrmp8GGi3dH4n9CrOn11yydAU0ytpbU2y+24wzgKGCCsBRSD0PKM42jzWnvFnM0ecvGU1EtJm5qLdU67PzMo0tKOxW4kIW2ErBStopQgcpwRyg53MVogw0W8pHFPopY78xV9PdBGqZWVsllD/astAg9UqUkKUEkgZCcZx1jxrvE87M8N9dsmYkaqi6qrVXqsa1LTCW22nnJtExlIHfSRy4GDttFdIOIaLH17iOtfU/RmWtTWOzJ2q3BJcwlLkpTrTLyDjZwpUMZP00Dur64SdxXMAcxxkj1gBMTNoJMTQ9lskjaLgcJ1h0y1rerHEBfKRL0iksOopinBupQHK68kHqd+yR5qUrHSOI6H6RVTV3U6Wt+VDrFNZw/U55Kc+zsZwcfbUe6keZz0BjrvFXqtSkoktFrD7KWtm3ghqZTLHuOvtjCWgfFLW+T4rJP0Y3WM+6RwXVC/KnqFqRVrsqpKX594rS1nIZbGzbQ9EpAHyJ8Y8A4rJiZ90rWTGKoxiZ0NJhpgmAYBCHAwwQ4dYBwMZDLhSesYwh4MB2HRLV+raU381VpbtJimzHKzUZJKsds1nOU+Tidyk/EdCY6hxD6N0mp0Qa2aVhqdtqoo9qqEvKp2l1E959KfooJyFp+grJ6E4quy8UKyDHdtBtd57TGsqplUQ5ULVnl/wBdkcBZaJGC80DtnGyk9Fjbrgx0raJj1sOFuNlJxiIinwi0utvD/TlUT+lLR8oq1qziDNPSUllZk09StodS0DnKPebOQRgbVjcaI38PSM2rNZyRi4hYiQphuIyGQoOMQiIBuNoEOgYgBiEYMAiAUKDiBAKFBxCgBiFgw4DeHBOYBgG8PCfSHBETJaz4QDEoJO0epseya/fd5yNsW3Iqm6jOL5UJ6JQke84tX0UJG5V4fEgRLY1hXJf13y1t2vTVzs8/vgd1DSB1ccV0QgeJPwGTgRbup1WyOELTRyg2+5LVzUmqsJVMTLiNmh4LWOqGUndDfVZ7yto3Wu8z0I7/ALot3ha0TRpbYU4iYvSqNdtUqokYcZ5k4L5+qojKWkfRT3jv1pBOzSnnVFSiST1JyTGwuG4KnX67N1erzz07PTbqnpiZeVzLdWeqif8A7joNo0KlZO8S1tDVHeGEwVGGGMgGAYJgGAQ6QQRDAYMA/O8OBiMdIcDASpO8ZLD5QobxhAw5KsGA7do1rrcmlNZxKqVUKHML5pulOL5UrPTtGz9BzHj0PQg+HZLz0XsPW6239QtEZ6TlKorvz1BXhlKnDuQU/wBg4f8Apr6gjrFNWnik9Y9ZZ18XBZlxM1y26q/T55rYOtHZSfFK0nZaT4pIIjpW/GW6GvrlvVe361MUit02ap0/Lq5XZWabLbiD6g+Hkeh8I1KmiPCLjU3WHSfXKiS9va00eWo9YQns5atS5LbaSfFLm6md/or5m/hHg9Q+FW8LeZVV7MeRd1FWO0bXJge0hHmWwSHB9psn4CE+P5rymq4lEDlMbKZkH5aZcl32XGnWzyrbcSUqQfIg7g/GMUtEeEc1YxEDETlvHhDSiAhxCx4xJy+kLkgI8QMRLyweQ+UBFiDgxKG4eG8+EBAEnMSpQfKJ0MKV0THq7O07u2+qsKfatAm6m6D31NJw216rcOEoHxMWI0eUbZKsDEdc0e0DvHVipNuyDBp1CSvlfrMyg9kPNLSerq/QbDxIjsVB0A0y0ko7N067XLJTT+OdiiSyiW3CPo8owt8+gCUeZIjxeq/FJXLnpa7UsaV/mtbCUdgluXwiYeb6cqijZpH2EfMmOnpFebI6Rd2qunfDrZ0xp7o0zLVK4192oVp3leDbg25lrGzrg3w2O4jxycg04rddqNbq8zVKpPPzs7MuF1+YmFlbjqz1UonqYwX5pS9s7eUYal5PWMWtqktZJiMmETmGmMhEw0wTDSYBGAYWYEA2CDAhQDoOYaDBBgHAw4GGZggwEgMSpcI8YgzBzAbFibWgjBMdH0/1ovnTx5KbdrbiJPOV0+ZHbSy/7s+6fVODHKQrESpdIixMxzAuK3rlotqpKIk9XrGRIz+OUVWTSpwJPmHEYdQPQ84jEnOGCzrwlF1LSXUqQn2z3hKTig8U+nO3haf0kRU1uaUk9Yz5OsTMnNImZWYdYeQcpdZWULHwUMER0+pv5RqY6rcPDfq3QFLLlpPVFpP9tS3EzI/VB5x80xzapW7VqQ+WarTJ2RcGxRNS62iP1gI6Db/EVqtb6ENy14Tc2ynYM1FKZpP3rBV+MdFp/GNdamQxcFq0CrIxgkdoyT8iVJ/CGeOfnBWn2YH3Sk/A5hGTc+qYtGeI/Syqb3BojTXVn3lNCWX/AImkn8YadYeG57vPaIAK+yxL/wAFiJ6V/wBhV72RY8DBTLZUEhSST4Z3i0H9NfD1KHmktDmVKHTtGJYfvKoJ4qbZpKcWvo/RZEj3VLcbRj/ptA/jF9K/NhwSh6b3tca0poVpVqoZ6KZk1lP6xAT+MdYtfhI1MrHK7WRTbfl+qlTb3bOJH/A3nHzUIdWuL3UyoNqapyKNSG+g7CWLyh8C4oj8I5ZcurF+XWFJr93VaebP9iuYKWv1E4T+EPsj/osO3pzw06UkPXvdy7tqrW5p7CudHN5Flk/4149I0l3cWlQl6T+QNLbbkbUpbY5WnS0hbyR5obSOzbPrhR9YrCudURgHA8hGIt8q8Yk+Sf8AHgxu67c1Xr9XeqlZqU1UJ145cmZp0uOK+JPh6dI0TjylKyTEZXmGkxzUSrO8NJgZgEwCJgEwswDALMNMLMCAUKFAzACFChQCg5gQoB0KADBgD0h2TDIOYB4O0HMMBg5gJAqHBZERc0HMBOHSIcH1ecY+YWfWAyxMqA6wfaVY6xiZhEwGX7Sr6xhpfUfExjEwswE5eOOsMLhMR5gEwDyqGk7dYbmFmAJMAmATAzAGATCzDSYA5gZgQoBQoUKAHjAgmBAf/9k=';
  const avatarHtml = (u, cls = '') =>
    `<img class="avatar ${cls}" src="${esc(u?.avatar_url || DEFAULT_AVATAR)}" alt="" loading="lazy" referrerpolicy="no-referrer">`;
  const ROLE_DESC = {
    owner: 'Полный доступ: роли, баны, разделы и все тикеты.',
    admin: 'Модерация, инвайты, разделы и все тикеты.',
    helper: 'Особых прав на сайте пока нет.',
    user: 'Участник форума.',
  };

  function flash(msg) { state.flashes.push(msg); }
  function flashHtml() {
    const html = state.flashes.map((m) => `<div class="flash">${esc(m)}</div>`).join('');
    state.flashes = [];
    return html;
  }
  function friendlyError(err) {
    const m = String(err?.message || err || '');
    if (/profiles_username_lower|duplicate key|already registered|Database error saving new user/i.test(m)) {
      return 'Этот ник уже занят или инвайт недействителен.';
    }
    return m;
  }
  function render(html) { $app().innerHTML = flashHtml() + html; }
  function notFound() { render('<div class="panel empty"><h1>404</h1><p>Страница не найдена.</p></div>'); }
  function goto(hash) { if (location.hash === hash) return route(); location.hash = hash; }
  async function rpc(fn, args) {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw error;
    return data;
  }
  async function loadMe() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) { state.me = null; return; }
    const { data, error } = await sb.rpc('my_profile');
    state.me = !error && data && data.length ? data[0] : null;
  }
  function renderNav() {
    const links = ['<a href="#/">Форум</a>'];
    if (state.me) {
      links.push('<a href="#/tickets">Тикеты</a>');
      if (isStaff()) links.push('<a href="#/admin">Администрация</a>');
      links.push(`<a href="#/u/${state.me.uid}">${esc(state.me.username)} <span class="uid">#${state.me.uid}</span></a>`);
      links.push('<button class="link" data-action="logout">Выйти</button>');
    } else {
      links.push('<a href="#/login">Вход</a>', '<a href="#/register">Регистрация</a>');
    }
    document.getElementById('nav').innerHTML = links.join('');
  }
  function needLogin(next) {
    flash('Сначала войдите в аккаунт.');
    goto('#/login?next=' + encodeURIComponent(next));
  }

  // ---------- представления ----------
  // ---------- чат и статистика ----------
  let chatTimer = null;
  const chatLine = (m) => {
    if (m.is_bot) {
      return `<div class="chat-msg bot"><div class="chat-main"><span class="chat-name">ChatBot</span> <span class="muted">${fmt(m.created_at)}</span><div class="chat-body">${esc(m.body)}</div></div></div>`;
    }
    const a = m.author || { uid: 0, username: '?', role: 'user' };
    return `<div class="chat-msg"><div class="avatar-wrap">${avatarHtml(a, 'avatar-xs')}</div><div class="chat-main"><a class="chat-name" href="#/u/${a.uid}">${esc(a.username)}</a> ${roleTag(a.role)} <span class="muted">${fmt(m.created_at)}</span><div class="chat-body">${esc(m.body)}</div></div></div>`;
  };
  async function loadChat() {
    const box = document.getElementById('chat-box');
    if (!box) return;
    const { data, error } = await sb.from('chat_messages')
      .select('id, body, created_at, is_bot, author:profiles!author_uid(uid, username, role, avatar_url)')
      .order('id', { ascending: false }).limit(50);
    if (!document.getElementById('chat-box')) return;
    if (error) { box.innerHTML = `<div class="muted">${esc(friendlyError(error))}</div>`; return; }
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    box.innerHTML = data.slice().reverse().map(chatLine).join('') || '<div class="muted">Сообщений пока нет.</div>';
    if (atBottom) box.scrollTop = box.scrollHeight;
  }
  async function loadStats() {
    const el = document.getElementById('site-stats');
    if (!el) return;
    const { data, error } = await sb.rpc('site_stats');
    if (!document.getElementById('site-stats')) return;
    if (error || !data || !data.length) { el.innerHTML = ''; return; }
    const s = data[0];
    el.innerHTML = `<div class="stats-plate"><span>Участников: <b>${s.members}</b></span><span>Последний: <a href="#/u/${s.last_uid}">${esc(s.last_username)}</a> <span class="muted">${fmt(s.last_joined)}</span></span></div>`;
  }

  async function viewIndex() {
    const [cats, threads] = await Promise.all([
      sb.from('categories').select('id, name, description').order('position').order('id'),
      sb.from('thread_list').select('category_id, last_post_at'),
    ]);
    if (cats.error) throw cats.error;
    if (threads.error) throw threads.error;
    const stats = {};
    for (const t of threads.data) {
      const s = (stats[t.category_id] ??= { count: 0, last: null });
      s.count++;
      if (!s.last || t.last_post_at > s.last) s.last = t.last_post_at;
    }
    const rows = cats.data.map((c) => {
      const s = stats[c.id] || { count: 0, last: null };
      return `<a class="row" href="#/c/${c.id}">
        <div class="grow"><div class="row-title">${esc(c.name)}</div><div class="muted">${esc(c.description)}</div></div>
        <div class="stat">${s.count} тредов</div><div class="stat muted">${fmt(s.last)}</div></a>`;
    }).join('');
    const clearBtn = isStaff() ? '<button class="btn small danger" data-action="chat-clear">Очистить чат</button>' : '';
    let chatInner;
    if (!state.me) {
      chatInner = '<div class="panel empty muted">Чат виден только зарегистрированным участникам. <a href="#/login">Войдите</a>.</div>';
    } else {
      const form = state.me.banned
        ? '<div class="muted">Аккаунт заблокирован: писать в чат нельзя.</div>'
        : '<form class="chat-form" data-form="chat"><input name="body" maxlength="1000" required placeholder="Написать в общий чат" autocomplete="off"><button class="btn" type="submit">Отправить</button></form>';
      chatInner = `<div class="panel chat">
          <div class="chat-head">${clearBtn}</div>
          <div id="chat-box" class="chat-box"></div>
          ${form}
        </div>`;
    }
    render(`<div id="site-stats"></div>
      <h1>Разделы</h1>
      <div class="panel">${rows || '<div class="row muted">Разделов пока нет.</div>'}</div>
      <h2>Общий чат</h2>
      ${chatInner}`);
    loadStats();
    if (state.me) {
      loadChat();
      chatTimer = setInterval(loadChat, 5000);
    }
  }

  async function viewCategory(id) {
    const [cat, threads] = await Promise.all([
      sb.from('categories').select('id, name, staff_only').eq('id', id).maybeSingle(),
      sb.from('thread_list')
        .select('id, title, is_pinned, is_locked, author_name, created_at, last_post_at, replies')
        .eq('category_id', id)
        .order('is_pinned', { ascending: false })
        .order('last_post_at', { ascending: false }),
    ]);
    if (cat.error) throw cat.error;
    if (threads.error) throw threads.error;
    if (!cat.data) return notFound();
    const postBtn = !state.me
      ? '<a class="btn" href="#/login">Войдите, чтобы писать</a>'
      : state.me.banned ? '<span class="muted">Аккаунт заблокирован</span>'
      : (!cat.data.staff_only || isStaff())
        ? `<a class="btn" href="#/c/${id}/new">Новый тред</a>`
        : '<span class="muted">Раздел только для администрации</span>';
    const rows = threads.data.map((t) => `<a class="row" href="#/t/${t.id}"><div class="grow">
        <div class="row-title">${t.is_pinned ? '<span class="tag">закреплён</span>' : ''}${t.is_locked ? '<span class="tag lock">закрыт</span>' : ''}${esc(t.title)}</div>
        <div class="muted">${esc(t.author_name)} · ${fmt(t.created_at)}</div></div>
        <div class="stat">${t.replies} отв.</div><div class="stat muted">${fmt(t.last_post_at)}</div></a>`).join('');
    render(`<div class="crumbs"><a href="#/">Форум</a> / ${esc(cat.data.name)}</div>
      <div class="head-row"><h1>${esc(cat.data.name)}</h1>
      ${postBtn}</div>
      <div class="panel">${rows || '<div class="row muted">В этом разделе ещё нет тредов.</div>'}</div>`);
  }

  async function viewNewThread(catId) {
    if (!state.me) return needLogin(`/c/${catId}/new`);
    if (state.me.banned) { flash('Аккаунт заблокирован.'); return goto(`#/c/${catId}`); }
    const cat = await sb.from('categories').select('staff_only').eq('id', catId).maybeSingle();
    if (cat.error) throw cat.error;
    if (cat.data?.staff_only && !isStaff()) {
      flash('В этот раздел могут писать только администраторы.');
      return goto(`#/c/${catId}`);
    }
    render(`<div class="crumbs"><a href="#/">Форум</a> / <a href="#/c/${catId}">раздел</a> / новый тред</div>
      <h1>Новый тред</h1>
      <form class="panel form" data-form="new-thread" data-cat="${catId}">
        <label>Заголовок<input name="title" required minlength="3" maxlength="120"></label>
        <label>Текст<textarea name="body" rows="10" required maxlength="20000"></textarea></label>
        <button class="btn" type="submit">Опубликовать</button>
      </form>`);
  }

  async function viewThread(id) {
    const [t, posts] = await Promise.all([
      sb.from('thread_list').select('*').eq('id', id).maybeSingle(),
      sb.from('posts').select('id, body, created_at, author:profiles!author_uid(uid, username, role, avatar_url)')
        .eq('thread_id', id).order('id'),
    ]);
    if (t.error) throw t.error;
    if (posts.error) throw posts.error;
    if (!t.data) return notFound();
    const th = t.data;
    const catRes = await sb.from('categories').select('staff_only').eq('id', th.category_id).maybeSingle();
    const staffOnly = !!catRes.data?.staff_only;
    const mod = isStaff() ? `<div class="mod panel">
        <span class="muted">Модерация:</span>
        <button class="btn small" data-action="thread-mod" data-thread="${th.id}" data-mod="pin">${th.is_pinned ? 'Открепить' : 'Закрепить'}</button>
        <button class="btn small" data-action="thread-mod" data-thread="${th.id}" data-mod="lock">${th.is_locked ? 'Открыть' : 'Закрыть'}</button>
        <button class="btn small danger" data-action="thread-delete" data-thread="${th.id}" data-category="${th.category_id}">Удалить тред</button>
      </div>` : '';
    const postsHtml = posts.data.map((p, i) => `<article class="post" id="post-${p.id}">
        <aside class="author">
          ${avatarHtml(p.author)}
          <a class="name" href="#/u/${p.author.uid}">${esc(p.author.username)}</a>
          ${roleTag(p.author.role)}
          <div class="muted">UID ${p.author.uid}</div>
        </aside>
        <div class="content">
          <div class="meta muted">${fmt(p.created_at)} · #${i + 1}
            ${isStaff() && i > 0 ? ` <button class="link danger" data-action="post-delete" data-post="${p.id}">удалить</button>` : ''}
          </div>
          <div class="body">${esc(p.body)}</div>
        </div></article>`).join('');
    let replyBox;
    if (!state.me) {
      replyBox = `<div class="panel muted"><a href="#/login?next=${encodeURIComponent('/t/' + id)}">Войдите</a>, чтобы ответить.</div>`;
    } else if (state.me.banned) {
      replyBox = '<div class="panel muted">Аккаунт заблокирован. Писать нельзя.</div>';
    } else if (staffOnly && !isStaff()) {
      replyBox = '<div class="panel muted">В этом разделе писать могут только администраторы.</div>';
    } else if (th.is_locked && !isStaff()) {
      replyBox = '<div class="panel muted">Тред закрыт для ответов.</div>';
    } else {
      replyBox = `<form class="panel form" data-form="reply" data-thread="${id}">
        <label>Ответ<textarea name="body" rows="6" required maxlength="20000"></textarea></label>
        <button class="btn" type="submit">Ответить</button></form>`;
    }
    render(`<div class="crumbs"><a href="#/">Форум</a> / <a href="#/c/${th.category_id}">${esc(th.category_name)}</a></div>
      <h1>${th.is_pinned ? '<span class="tag">закреплён</span>' : ''}${th.is_locked ? '<span class="tag lock">закрыт</span>' : ''}${esc(th.title)}</h1>
      ${mod}${postsHtml}${replyBox}`);
  }

  async function viewProfile(uid) {
    const [u, tc, pc, recent] = await Promise.all([
      sb.from('profiles').select('uid, username, role, created_at, banned, avatar_url, bio').eq('uid', uid).maybeSingle(),
      sb.from('threads').select('id', { count: 'exact', head: true }).eq('author_uid', uid),
      sb.from('posts').select('id', { count: 'exact', head: true }).eq('author_uid', uid),
      sb.from('thread_list').select('id, title, category_name, created_at')
        .eq('author_uid', uid).order('id', { ascending: false }).limit(10),
    ]);
    for (const r of [u, tc, pc, recent]) if (r.error) throw r.error;
    if (!u.data) return notFound();
    const p = u.data;
    const own = !!state.me && state.me.uid === p.uid;
    const list = recent.data.map((t) => `<a class="row" href="#/t/${t.id}"><div class="grow">
        <div class="row-title">${esc(t.title)}</div>
        <div class="muted">${esc(t.category_name)} · ${fmt(t.created_at)}</div></div></a>`).join('');
    const editForm = own ? `<h2>Редактировать профиль</h2>
      <form class="panel form" data-form="profile">
        <label>Загрузить картинку (до 2 МБ: PNG, JPG, GIF, WEBP)
          <input type="file" name="avatarFile" accept="image/png,image/jpeg,image/gif,image/webp"></label>
        <label>Или ссылка на аватар (https://…, поле пустое — аватар убрать)
          <input name="avatar" value="${esc(p.avatar_url || '')}" maxlength="500" placeholder="https://example.com/avatar.png"></label>
        <label>Описание (до 500 символов)
          <textarea name="bio" rows="4" maxlength="500">${esc(p.bio || '')}</textarea></label>
        <button class="btn" type="submit">Сохранить</button>
      </form>` : '';
    render(`<div class="profile-head">
        ${avatarHtml(p, 'avatar-lg')}
        <div>
          <h1>${esc(p.username)} <span class="uid">#${p.uid}</span></h1>
          <div class="role-card">${roleTag(p.role)} <span class="muted">${esc(ROLE_DESC[p.role] || '')}</span></div>
        </div>
      </div>
      ${p.banned ? '<div class="panel muted">Аккаунт заблокирован.</div>' : ''}
      <div class="panel profile">
        <div class="row"><span class="muted">UID</span><b>${p.uid}</b></div>
        <div class="row"><span class="muted">Регистрация</span>${fmt(p.created_at)}</div>
        <div class="row"><span class="muted">Тредов</span>${tc.count ?? 0}</div>
        <div class="row"><span class="muted">Сообщений</span>${pc.count ?? 0}</div>
      </div>
      <h2>О себе</h2>
      <div class="panel bio">${p.bio ? esc(p.bio) : '<span class="muted">Пока пусто.</span>'}</div>
      ${editForm}
      <h2>Последние треды</h2>
      <div class="panel">${list || '<div class="row muted">Тредов пока нет.</div>'}</div>`);
  }

  function viewLogin(_m, params) {
    if (state.me) return goto('#/');
    const next = esc(params.get('next') || '');
    render(`<h1>Вход</h1>
      <form class="panel form narrow" data-form="login" data-next="${next}">
        <label>Ник<input name="username" required autocomplete="username"></label>
        <label>Пароль<input name="password" type="password" required autocomplete="current-password"></label>
        <button class="btn" type="submit">Войти</button>
      </form>`);
  }

  async function viewRegister(_m, params) {
    if (state.me) return goto('#/');
    const invite = esc(params.get('invite') || '');
    render(`<h1>Регистрация</h1>
      <p class="muted">Регистрация открыта только по инвайт-коду от администрации.</p>
      <form class="panel form narrow" data-form="register">
        <label>Инвайт-код<input name="invite" value="${invite}" required></label>
        <label>Ник (3–20 символов)<input name="username" required pattern="[A-Za-z0-9_]{3,20}" autocomplete="username"></label>
        <label>Пароль (минимум 8)<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>
        <label>Повторите пароль<input name="password2" type="password" required minlength="8" autocomplete="new-password"></label>
        <button class="btn" type="submit">Создать аккаунт</button>
      </form>`);
  }

  async function viewAdmin() {
    if (!isStaff()) return render('<div class="panel empty"><h1>403</h1><p>Доступ запрещён.</p></div>');
    const [users, invites, cats] = await Promise.all([
      sb.from('profiles').select('uid, username, role, banned, created_at, inviter:profiles!invited_by(username)').order('uid'),
      sb.from('invites')
        .select('code, created_at, used_at, creator:profiles!created_by(username), used:profiles!used_by(username)')
        .order('created_at', { ascending: false }).limit(200),
      sb.from('categories').select('id, name, description').order('position').order('id'),
    ]);
    for (const r of [users, invites, cats]) if (r.error) throw r.error;

    const userRows = users.data.map((u) => {
      const parts = [];
      if (isOwner() && u.role !== 'owner') {
        if (u.role === 'admin') {
          parts.push(`<button class="btn small danger" data-action="set-role" data-uid="${u.uid}" data-role="user">Снять админа</button>`);
        } else if (u.role === 'helper') {
          parts.push(`<button class="btn small danger" data-action="set-role" data-uid="${u.uid}" data-role="user">Снять помощника</button>`);
        } else {
          parts.push(`<button class="btn small" data-action="set-role" data-uid="${u.uid}" data-role="admin">Сделать админом</button>`);
          parts.push(`<button class="btn small" data-action="set-role" data-uid="${u.uid}" data-role="helper">Сделать помощником</button>`);
        }
      }
      const canBan = u.role !== 'owner' && u.uid !== state.me.uid && (u.role === 'user' || isOwner());
      if (canBan) {
        parts.push(u.banned
          ? `<button class="btn small" data-action="set-ban" data-uid="${u.uid}" data-banned="false">Разбанить</button>`
          : `<button class="btn small danger" data-action="set-ban" data-uid="${u.uid}" data-banned="true">Забанить</button>`);
      }
      const action = parts.join(' ') || '<span class="muted">—</span>';
      return `<div class="row">
        <div class="stat narrow-col">${u.uid}</div>
        <div class="grow"><a href="#/u/${u.uid}">${esc(u.username)}</a>${u.banned ? ' <span class="tag lock">заблокирован</span>' : ''}</div>
        <div class="stat">${roleTag(u.role)}</div>
        <div class="stat muted">${esc(u.inviter?.username || '—')}</div>
        <div class="stat action">${action}</div></div>`;
    }).join('');

    const inviteRows = invites.data.map((i) => `<div class="row">
        <div class="grow"><code>${esc(i.code)}</code> <span class="muted">${fmt(i.created_at)}</span></div>
        <div class="stat">${esc(i.creator?.username || 'bootstrap')}</div>
        <div class="stat">${i.used_at ? `${esc(i.used?.username || '?')} · ${fmt(i.used_at)}` : '<span class="ok">свободен</span>'}</div>
      </div>`).join('');

    const catRows = cats.data.map((c) => `<div class="row">
        <div class="grow"><b>${esc(c.name)}</b> <span class="muted">${esc(c.description)}</span></div>
        <div class="stat muted">#${c.id}</div></div>`).join('');

    render(`<h1>Администрация</h1>
      <h2>Инвайт-коды</h2>
      <div class="panel inline-form"><button class="btn" data-action="create-invite">Сгенерировать инвайт</button></div>
      <div class="panel">
        <div class="row head"><div class="grow">Код</div><div class="stat">Создал</div><div class="stat">Использован</div></div>
        ${inviteRows || '<div class="row muted">Инвайтов пока нет.</div>'}
      </div>
      <h2>Пользователи</h2>
      <div class="panel">
        <div class="row head"><div class="stat narrow-col">UID</div><div class="grow">Ник</div>
          <div class="stat">Роль</div><div class="stat">Пригласил</div><div class="stat">Действие</div></div>
        ${userRows}
      </div>
      <h2>Разделы</h2>
      <form class="panel form" data-form="category">
        <label>Название<input name="name" required maxlength="60"></label>
        <label>Описание<input name="description" maxlength="200"></label>
        <label>Порядок<input name="position" type="number" value="${cats.data.length + 1}"></label>
        <button class="btn" type="submit">Создать раздел</button>
      </form>
      <div class="panel">${catRows}</div>`);
  }

  // ---------- тикеты ----------
  const TICKET_STATUS = { open: 'Открыт', in_progress: 'В работе', closed: 'Закрыт' };
  const ticketStatus = (s) => `<span class="role ${s === 'closed' ? '' : 'role-admin'}">${esc(TICKET_STATUS[s] || s)}</span>`;

  async function viewTickets() {
    if (!state.me) return needLogin('/tickets');
    const { data, error } = await sb.from('tickets')
      .select('id, subject, status, created_at, author:profiles!author_uid(uid, username)')
      .order('updated_at', { ascending: false }).limit(100);
    if (error) throw error;
    const rows = data.map((t) => `<a class="row" href="#/tickets/${t.id}"><div class="grow">
        <div class="row-title">${esc(t.subject)}</div>
        <div class="muted">${esc(t.author.username)} · ${fmt(t.created_at)}</div></div>
        <div class="stat">${ticketStatus(t.status)}</div></a>`).join('');
    render(`<div class="head-row"><h1>Тикеты</h1><a class="btn" href="#/tickets/new">Новый тикет</a></div>
      <p class="muted">Сообщайте о багах и вопросах по сайту.${isSupport() ? ' Вы видите тикеты всех пользователей.' : ' Вы видите только свои тикеты.'}</p>
      <div class="panel">${rows || '<div class="row muted">Тикетов пока нет.</div>'}</div>`);
  }

  function viewNewTicket() {
    if (!state.me) return needLogin('/tickets/new');
    if (state.me.banned) { flash('Аккаунт заблокирован.'); return goto('#/tickets'); }
    render(`<div class="crumbs"><a href="#/tickets">Тикеты</a> / новый</div>
      <h1>Новый тикет</h1>
      <form class="panel form" data-form="new-ticket">
        <label>Тема<input name="subject" required minlength="3" maxlength="120" placeholder="Например: не открывается страница раздела"></label>
        <label>Описание (что делали, что ожидали, что получилось)<textarea name="body" rows="8" required maxlength="5000"></textarea></label>
        <button class="btn" type="submit">Отправить</button>
      </form>`);
  }

  async function viewTicket(id) {
    if (!state.me) return needLogin(`/tickets/${id}`);
    const [t, msgs] = await Promise.all([
      sb.from('tickets').select('id, subject, status, created_at, author:profiles!author_uid(uid, username)').eq('id', id).maybeSingle(),
      sb.from('ticket_messages').select('id, body, created_at, author:profiles!author_uid(uid, username, role)').eq('ticket_id', id).order('id'),
    ]);
    if (t.error) throw t.error;
    if (msgs.error) throw msgs.error;
    if (!t.data) return notFound();
    const tk = t.data;
    const statusBtns = isSupport()
      ? `<div class="mod panel"><span class="muted">Статус:</span>
          ${['open', 'in_progress', 'closed'].map((s) => `<button class="btn small" data-action="ticket-status" data-ticket="${tk.id}" data-status="${s}" ${tk.status === s ? 'disabled' : ''}>${TICKET_STATUS[s]}</button>`).join(' ')}
        </div>` : '';
    const list = msgs.data.map((m) => `<article class="post">
        <aside class="author"><a class="name" href="#/u/${m.author.uid}">${esc(m.author.username)}</a>${roleTag(m.author.role)}</aside>
        <div class="content"><div class="meta muted">${fmt(m.created_at)}</div><div class="body">${esc(m.body)}</div></div></article>`).join('');
    let reply;
    if (state.me.banned) reply = '<div class="panel muted">Аккаунт заблокирован. Писать нельзя.</div>';
    else if (tk.status === 'closed' && !isSupport()) reply = '<div class="panel muted">Тикет закрыт.</div>';
    else reply = `<form class="panel form" data-form="ticket-reply" data-ticket="${tk.id}">
        <label>Ответ<textarea name="body" rows="5" required maxlength="5000"></textarea></label>
        <button class="btn" type="submit">Ответить</button></form>`;
    render(`<div class="crumbs"><a href="#/tickets">Тикеты</a> / #${tk.id}</div>
      <h1>${esc(tk.subject)} ${ticketStatus(tk.status)}</h1>
      <div class="muted">От ${esc(tk.author.username)} · ${fmt(tk.created_at)}</div>
      ${statusBtns}${list}${reply}`);
  }

  // ---------- маршрутизация ----------
  const ROUTES = [
    [/^\/$/, viewIndex],
    [/^\/c\/(\d+)$/, (m) => viewCategory(Number(m[1]))],
    [/^\/c\/(\d+)\/new$/, (m) => viewNewThread(Number(m[1]))],
    [/^\/t\/(\d+)$/, (m) => viewThread(Number(m[1]))],
    [/^\/u\/(\d+)$/, (m) => viewProfile(Number(m[1]))],
    [/^\/login$/, viewLogin],
    [/^\/register$/, viewRegister],
    [/^\/admin$/, viewAdmin],
    [/^\/tickets$/, viewTickets],
    [/^\/tickets\/new$/, viewNewTicket],
    [/^\/tickets\/(\d+)$/, (m) => viewTicket(Number(m[1]))],
  ];

  let routeToken = 0;
  async function route() {
    const token = ++routeToken;
    if (chatTimer) { clearInterval(chatTimer); chatTimer = null; }
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, query = ''] = raw.split('?');
    const params = new URLSearchParams(query);
    for (const [re, handler] of ROUTES) {
      const m = path.match(re);
      if (!m) continue;
      try {
        await handler(m, params);
      } catch (err) {
        if (token === routeToken) render(`<div class="panel empty"><h1>Ошибка</h1><p>${esc(friendlyError(err))}</p></div>`);
      }
      return;
    }
    notFound();
  }

  // ---------- действия (кнопки) ----------
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    e.preventDefault();
    const d = el.dataset;
    try {
      if (d.action === 'logout') {
        await sb.auth.signOut();
        state.me = null;
        renderNav();
        flash('Вы вышли.');
        return goto('#/');
      }
      if (d.action === 'thread-mod') {
        await rpc('mod_thread', { p_thread: Number(d.thread), p_action: d.mod });
        flash('Готово.');
      } else if (d.action === 'thread-delete') {
        if (!confirm('Удалить тред целиком?')) return;
        await rpc('delete_thread', { p_thread: Number(d.thread) });
        flash('Тред удалён.');
        return goto(`#/c/${d.category}`);
      } else if (d.action === 'post-delete') {
        if (!confirm('Удалить сообщение?')) return;
        await rpc('delete_post', { p_post: Number(d.post) });
        flash('Сообщение удалено.');
      } else if (d.action === 'create-invite') {
        const code = await rpc('create_invite');
        flash(`Инвайт создан: ${code}`);
      } else if (d.action === 'ticket-status') {
        await rpc('set_ticket_status', { p_ticket: Number(d.ticket), p_status: d.status });
        flash('Статус изменён.');
      } else if (d.action === 'chat-clear') {
        if (!confirm('Очистить общий чат?')) return;
        await rpc('clear_chat');
        flash('Чат очищен.');
      } else if (d.action === 'set-ban') {
        await rpc('set_ban', { p_uid: Number(d.uid), p_banned: d.banned === 'true' });
        flash(d.banned === 'true' ? 'Пользователь заблокирован.' : 'Пользователь разблокирован.');
      } else if (d.action === 'set-role') {
        await rpc('set_role', { p_uid: Number(d.uid), p_role: d.role });
        flash('Роль изменена.');
      }
      await route();
    } catch (err) {
      flash(friendlyError(err));
      await route();
    }
  });

  // ---------- формы ----------
  document.addEventListener('submit', async (e) => {
    const f = e.target;
    const kind = f.dataset.form;
    if (!kind) return;
    e.preventDefault();
    const v = (name) => (f.elements[name]?.value ?? '').trim();
    try {
      if (kind === 'login') {
        const username = v('username');
        const password = f.elements.password.value;
        const { error } = USERNAME_RE.test(username)
          ? await sb.auth.signInWithPassword({ email: emailFor(username), password })
          : { error: new Error('x') };
        if (error) throw new Error(/banned/i.test(error.message) ? 'Аккаунт заблокирован.' : 'Неверный ник или пароль.');
        await loadMe();
        renderNav();
        flash('Вы вошли.');
        return goto('#' + safeNext(f.dataset.next));
      }

      if (kind === 'register') {
        const invite = v('invite').toUpperCase();
        const username = v('username');
        const password = f.elements.password.value;
        const password2 = f.elements.password2.value;
        if (!USERNAME_RE.test(username)) throw new Error('Ник: 3–20 символов, латиница, цифры и _.');
        if (password.length < 8) throw new Error('Пароль: минимум 8 символов.');
        if (password !== password2) throw new Error('Пароли не совпадают.');
        const valid = await rpc('check_invite', { p_code: invite });
        if (!valid) throw new Error('Инвайт-код недействителен или уже использован.');
        const { data, error } = await sb.auth.signUp({
          email: emailFor(username), password, options: { data: { username, invite } },
        });
        if (error) throw error;
        if (!data.session) throw new Error('В Supabase отключите подтверждение email (см. README).');
        await loadMe();
        renderNav();
        flash(`Добро пожаловать! Ваш UID: ${state.me?.uid ?? '—'}.`);
        return goto('#/');
      }

      if (kind === 'new-thread') {
        const id = await rpc('create_thread', {
          p_category: Number(f.dataset.cat), p_title: v('title'), p_body: v('body'),
        });
        return goto(`#/t/${id}`);
      }

      if (kind === 'reply') {
        await rpc('reply_to_thread', { p_thread: Number(f.dataset.thread), p_body: v('body') });
        flash('Ответ добавлен.');
        return route();
      }

      if (kind === 'new-ticket') {
        const id = await rpc('create_ticket', { p_subject: v('subject'), p_body: v('body') });
        flash('Тикет отправлен.');
        return goto(`#/tickets/${id}`);
      }

      if (kind === 'ticket-reply') {
        await rpc('reply_ticket', { p_ticket: Number(f.dataset.ticket), p_body: v('body') });
        flash('Ответ отправлен.');
        return route();
      }

      if (kind === 'profile') {
        let avatar = v('avatar');
        const file = f.elements.avatarFile?.files?.[0];
        if (file) {
          const types = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
          if (!types.includes(file.type)) throw new Error('Аватар: только PNG, JPG, GIF или WEBP.');
          if (file.size > 2 * 1024 * 1024) throw new Error('Аватар: файл больше 2 МБ.');
          const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
          const path = `${state.me.uid}/${Date.now()}.${ext}`;
          const { error: upErr } = await sb.storage.from('avatars').upload(path, file, { contentType: file.type });
          if (upErr) throw upErr;
          avatar = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
        }
        await rpc('update_profile', { p_avatar: avatar, p_bio: f.elements.bio.value.trim() });
        flash('Профиль сохранён.');
        return route();
      }

      if (kind === 'chat') {
        await rpc('send_chat_message', { p_body: v('body') });
        f.reset();
        return loadChat();
      }

      if (kind === 'category') {
        await rpc('create_category', {
          p_name: v('name'), p_description: v('description'), p_position: Number(v('position') || 0),
        });
        flash('Раздел создан.');
        return route();
      }
    } catch (err) {
      flash(friendlyError(err));
      await route();
    }
  });

  // ---------- старт ----------
  window.addEventListener('hashchange', route);
  (async () => {
    await loadMe();
    renderNav();
    await route();
  })();
})();
